-- Forward hardening: idempotent reservations, safe capability expiry, serialized publication,
-- narrowly authorized reads, and retryable cleanup. No browser access to storage paths.
BEGIN;
ALTER TABLE public.idea_update_uploads ADD COLUMN upload_token_expires_at timestamptz;
ALTER TABLE public.idea_update_uploads ADD COLUMN source_cleaned_at timestamptz;
UPDATE public.idea_update_uploads SET upload_token_expires_at=created_at + interval '2 hours 5 minutes',
  final_path=coalesce(final_path,id::text || '/final.' || CASE WHEN declared_mime='application/pdf' THEN 'pdf' ELSE 'webp' END);
ALTER TABLE public.idea_update_uploads ALTER COLUMN upload_token_expires_at SET NOT NULL;
ALTER TABLE public.idea_update_uploads ALTER COLUMN upload_token_expires_at SET DEFAULT clock_timestamp() + interval '2 hours 5 minutes';
CREATE INDEX idea_update_upload_source_cleanup_idx ON public.idea_update_uploads(upload_token_expires_at)
  WHERE state IN ('ready','published') AND source_cleaned_at IS NULL;

DROP FUNCTION public.reserve_progress_upload(uuid,uuid,text,text,integer,text);
CREATE FUNCTION public.reserve_progress_upload(p_actor_id uuid,p_request_id uuid,p_name text,p_mime text,p_size integer,p_alt text,p_upload_id uuid DEFAULT NULL)
RETURNS public.idea_update_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE draft public.idea_update_drafts%rowtype; file public.idea_update_uploads%rowtype; file_id uuid := coalesce(p_upload_id,gen_random_uuid());
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role::text IN ('admin','moderator','staff')) THEN
    RAISE EXCEPTION 'Staff access required' USING errcode='42501';
  END IF;
  IF p_request_id IS NULL OR p_name IS NULL OR char_length(trim(p_name)) NOT BETWEEN 1 AND 120
    OR p_mime IS NULL OR p_mime NOT IN ('image/jpeg','image/png','image/webp','application/pdf')
    OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 10485760
    OR (p_mime <> 'application/pdf' AND (p_alt IS NULL OR char_length(trim(p_alt)) NOT BETWEEN 1 AND 200))
    OR (p_alt IS NOT NULL AND char_length(trim(p_alt)) > 200) THEN RAISE EXCEPTION 'Invalid evidence' USING errcode='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  INSERT INTO public.idea_update_drafts(request_id,actor_id) VALUES(p_request_id,p_actor_id) ON CONFLICT DO NOTHING;
  SELECT * INTO draft FROM public.idea_update_drafts WHERE request_id=p_request_id FOR UPDATE;
  IF draft.actor_id IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Draft belongs to another account' USING errcode='42501'; END IF;
  IF draft.created_at + interval '24 hours' <= clock_timestamp() OR EXISTS(SELECT 1 FROM public.idea_updates WHERE request_id=p_request_id) THEN
    RAISE EXCEPTION 'Draft expired or published' USING errcode='22023';
  END IF;
  SELECT * INTO file FROM public.idea_update_uploads WHERE id=file_id FOR UPDATE;
  IF FOUND THEN
    IF file.actor_id IS DISTINCT FROM p_actor_id OR file.request_id IS DISTINCT FROM p_request_id THEN
      RAISE EXCEPTION 'Evidence belongs to another draft' USING errcode='42501';
    END IF;
    IF file.display_name IS DISTINCT FROM trim(p_name) OR file.declared_mime IS DISTINCT FROM p_mime
      OR file.declared_size IS DISTINCT FROM p_size OR file.alt IS DISTINCT FROM nullif(trim(p_alt),'') THEN
      RAISE EXCEPTION 'Reservation already used' USING errcode='23505';
    END IF;
    IF file.state NOT IN ('pending','ready') OR file.expires_at<=clock_timestamp() THEN
      RAISE EXCEPTION 'Draft expired or published' USING errcode='22023';
    END IF;
    IF file.state='pending' THEN
      UPDATE public.idea_update_uploads SET upload_token_expires_at=clock_timestamp() + interval '2 hours 5 minutes'
        WHERE id=file_id RETURNING * INTO file;
    END IF;
    RETURN file;
  END IF;
  IF (SELECT count(*) FROM public.idea_update_uploads WHERE request_id=p_request_id AND state IN ('pending','ready','published')) >= 5
    OR (SELECT count(*) FROM public.idea_update_uploads WHERE request_id=p_request_id) >= 25 THEN
    RAISE EXCEPTION 'Maximum evidence quota' USING errcode='22023';
  END IF;
  INSERT INTO public.idea_update_uploads(id,request_id,actor_id,display_name,declared_mime,declared_size,alt,temp_path,final_path)
    VALUES(file_id,p_request_id,p_actor_id,trim(p_name),p_mime,p_size,nullif(trim(p_alt),''),file_id::text || '/source',
      file_id::text || '/final.' || CASE WHEN p_mime='application/pdf' THEN 'pdf' ELSE 'webp' END) RETURNING * INTO file;
  RETURN file;
END; $$;

CREATE OR REPLACE FUNCTION public.attach_progress_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE draft public.idea_update_drafts%rowtype;
BEGIN
  -- The advisory lock covers the first reservation too, when no draft row exists yet.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.request_id::text,0));
  SELECT * INTO draft FROM public.idea_update_drafts WHERE request_id=NEW.request_id FOR UPDATE;
  IF FOUND THEN
    IF draft.actor_id IS DISTINCT FROM NEW.posted_by THEN RAISE EXCEPTION 'Draft belongs to another account' USING errcode='42501'; END IF;
    IF EXISTS(SELECT 1 FROM public.idea_update_uploads WHERE request_id=NEW.request_id AND state='pending') THEN
      RAISE EXCEPTION 'Finalize or remove all pending evidence first' USING errcode='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM public.idea_update_uploads WHERE request_id=NEW.request_id AND state='ready' AND expires_at<=clock_timestamp()) THEN
      RAISE EXCEPTION 'Evidence draft expired' USING errcode='22023';
    END IF;
    UPDATE public.idea_update_uploads SET state='published',update_id=NEW.id WHERE request_id=NEW.request_id AND state='ready';
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.read_staff_idea_update_files(p_submission_id uuid,p_actor_id uuid)
RETURNS TABLE(id uuid,update_id uuid,display_name text,mime_type text,size_bytes integer,alt text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE profiles.id=p_actor_id AND role::text IN ('admin','moderator','staff')) THEN
    RAISE EXCEPTION 'Staff access required' USING errcode='42501';
  END IF;
  RETURN QUERY SELECT f.id,f.update_id,f.display_name,f.mime_type,f.size_bytes,f.alt
    FROM public.idea_update_uploads f JOIN public.idea_updates u ON u.id=f.update_id
    WHERE u.submission_id=p_submission_id AND u.deleted_at IS NULL AND f.state='published'
    ORDER BY f.created_at,f.id LIMIT 500;
END; $$;
CREATE FUNCTION public.read_authorized_progress_file(p_file_id uuid,p_actor_id uuid DEFAULT NULL)
RETURNS SETOF public.idea_update_uploads LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.* FROM public.idea_update_uploads f
  LEFT JOIN public.idea_updates u ON u.id=f.update_id LEFT JOIN public.submissions s ON s.id=u.submission_id
  WHERE f.id=p_file_id AND (
    (f.state='published' AND u.deleted_at IS NULL AND u.visibility='public' AND s.status::text IN ('approved','in_progress','resolved'))
    OR (EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role::text IN ('admin','moderator','staff')) AND (
      (f.state='published' AND u.deleted_at IS NULL) OR
      (f.actor_id=p_actor_id AND f.state IN ('pending','ready') AND f.expires_at>clock_timestamp())
    ))
  );
$$;
CREATE OR REPLACE FUNCTION public.claim_progress_upload_cleanup(p_limit integer DEFAULT 50)
RETURNS SETOF public.idea_update_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY WITH candidates AS (
    SELECT id FROM public.idea_update_uploads WHERE upload_token_expires_at<=clock_timestamp() AND (
      state='delete_pending' OR (update_id IS NULL AND expires_at<=clock_timestamp() AND state<>'deleted')
    ) ORDER BY expires_at LIMIT least(greatest(p_limit,1),50) FOR UPDATE SKIP LOCKED
  ) UPDATE public.idea_update_uploads f SET state='delete_pending' FROM candidates c WHERE f.id=c.id RETURNING f.*;
END; $$;
CREATE FUNCTION public.list_progress_sources_to_clean(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid,temp_path text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.id,f.temp_path FROM public.idea_update_uploads f
  WHERE f.state IN ('ready','published') AND f.source_cleaned_at IS NULL AND f.upload_token_expires_at<=clock_timestamp()
  ORDER BY f.upload_token_expires_at LIMIT least(greatest(p_limit,1),50);
$$;
CREATE FUNCTION public.finish_progress_source_cleanup(p_file_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE public.idea_update_uploads SET source_cleaned_at=clock_timestamp()
  WHERE id=p_file_id AND state IN ('ready','published') AND upload_token_expires_at<=clock_timestamp();
$$;
REVOKE ALL ON FUNCTION public.reserve_progress_upload(uuid,uuid,text,text,integer,text,uuid),
  public.read_staff_idea_update_files(uuid,uuid),public.read_authorized_progress_file(uuid,uuid),
  public.list_progress_sources_to_clean(integer),public.finish_progress_source_cleanup(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_progress_upload(uuid,uuid,text,text,integer,text,uuid),
  public.read_staff_idea_update_files(uuid,uuid),public.read_authorized_progress_file(uuid,uuid),
  public.list_progress_sources_to_clean(integer),public.finish_progress_source_cleanup(uuid) TO service_role;
COMMIT;
