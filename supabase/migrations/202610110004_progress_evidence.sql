-- Private, direct-upload evidence. Only trusted server validation can publish a file.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('idea-update-evidence','idea-update-evidence',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
-- No browser storage policies: short-lived, object-specific signed tokens only.

CREATE TABLE public.idea_update_drafts (
  request_id uuid PRIMARY KEY,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.idea_update_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.idea_update_drafts(request_id),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  update_id uuid REFERENCES public.idea_updates(id) ON DELETE SET NULL,
  display_name text NOT NULL CHECK(char_length(display_name) BETWEEN 1 AND 120),
  alt text CHECK(alt IS NULL OR char_length(alt) BETWEEN 1 AND 200),
  declared_mime text NOT NULL CHECK(declared_mime IN ('image/jpeg','image/png','image/webp','application/pdf')),
  declared_size integer NOT NULL CHECK(declared_size BETWEEN 1 AND 10485760),
  temp_path text NOT NULL UNIQUE,
  final_path text UNIQUE,
  mime_type text CHECK(mime_type IN ('image/webp','application/pdf')),
  size_bytes integer CHECK(size_bytes BETWEEN 1 AND 10485760),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','published','delete_pending','deleted')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '24 hours',
  finalized_at timestamptz,
  CHECK(declared_mime = 'application/pdf' OR alt IS NOT NULL),
  CHECK(state NOT IN ('ready','published') OR (final_path IS NOT NULL AND mime_type IS NOT NULL AND size_bytes IS NOT NULL))
);
CREATE INDEX idea_update_upload_draft_idx ON public.idea_update_uploads(request_id,state);
CREATE INDEX idea_update_upload_update_idx ON public.idea_update_uploads(update_id) WHERE state = 'published';
CREATE INDEX idea_update_upload_cleanup_idx ON public.idea_update_uploads(expires_at) WHERE update_id IS NULL AND state <> 'deleted';
ALTER TABLE public.idea_update_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_update_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.idea_update_drafts,public.idea_update_uploads FROM public,anon,authenticated;
GRANT SELECT ON public.idea_update_drafts,public.idea_update_uploads TO service_role;

CREATE FUNCTION public.reserve_progress_upload(p_actor_id uuid,p_request_id uuid,p_name text,p_mime text,p_size integer,p_alt text)
RETURNS public.idea_update_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE draft public.idea_update_drafts%rowtype; file public.idea_update_uploads%rowtype; file_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role::text IN ('admin','moderator','staff')) THEN
    RAISE EXCEPTION 'Staff access required' USING errcode='42501';
  END IF;
  IF p_request_id IS NULL OR p_name IS NULL OR char_length(trim(p_name)) NOT BETWEEN 1 AND 120
    OR p_mime IS NULL OR p_mime NOT IN ('image/jpeg','image/png','image/webp','application/pdf')
    OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 10485760
    OR (p_mime <> 'application/pdf' AND (p_alt IS NULL OR char_length(trim(p_alt)) NOT BETWEEN 1 AND 200))
    OR (p_alt IS NOT NULL AND char_length(trim(p_alt)) > 200) THEN
    RAISE EXCEPTION 'Invalid evidence' USING errcode='22023';
  END IF;
  INSERT INTO public.idea_update_drafts(request_id,actor_id) VALUES(p_request_id,p_actor_id) ON CONFLICT DO NOTHING;
  SELECT * INTO draft FROM public.idea_update_drafts WHERE request_id=p_request_id FOR UPDATE;
  IF draft.actor_id IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Draft belongs to another account' USING errcode='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.idea_updates WHERE request_id=p_request_id) THEN
    RAISE EXCEPTION 'Published updates are immutable' USING errcode='22023';
  END IF;
  IF (SELECT count(*) FROM public.idea_update_uploads WHERE request_id=p_request_id AND state IN ('pending','ready','published')) >= 5 THEN
    RAISE EXCEPTION 'Maximum five files' USING errcode='22023';
  END IF;
  INSERT INTO public.idea_update_uploads(id,request_id,actor_id,display_name,declared_mime,declared_size,alt,temp_path)
    VALUES(file_id,p_request_id,p_actor_id,trim(p_name),p_mime,p_size,nullif(trim(p_alt),''),file_id::text || '/source') RETURNING * INTO file;
  RETURN file;
END; $$;

CREATE FUNCTION public.finalize_progress_upload(p_actor_id uuid,p_file_id uuid,p_path text,p_mime text,p_size integer)
RETURNS public.idea_update_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE file public.idea_update_uploads%rowtype;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role::text IN ('admin','moderator','staff')) THEN
    RAISE EXCEPTION 'Staff access required' USING errcode='42501';
  END IF;
  SELECT * INTO file FROM public.idea_update_uploads WHERE id=p_file_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evidence not found' USING errcode='P0002'; END IF;
  IF file.actor_id IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Evidence belongs to another account' USING errcode='42501'; END IF;
  IF p_path IS DISTINCT FROM file.id::text || '/final.' || CASE WHEN file.declared_mime='application/pdf' THEN 'pdf' ELSE 'webp' END
    OR p_mime IS DISTINCT FROM CASE WHEN file.declared_mime='application/pdf' THEN 'application/pdf' ELSE 'image/webp' END
    OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'Invalid validated evidence' USING errcode='22023'; END IF;
  IF file.state='ready' AND file.final_path=p_path AND file.mime_type=p_mime AND file.size_bytes=p_size THEN RETURN file; END IF;
  IF file.state<>'pending' OR file.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Evidence draft expired or published' USING errcode='22023'; END IF;
  UPDATE public.idea_update_uploads SET state='ready',final_path=p_path,mime_type=p_mime,size_bytes=p_size,finalized_at=clock_timestamp()
    WHERE id=p_file_id RETURNING * INTO file;
  RETURN file;
END; $$;

CREATE FUNCTION public.cancel_progress_upload(p_actor_id uuid,p_file_id uuid)
RETURNS public.idea_update_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE file public.idea_update_uploads%rowtype;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role::text IN ('admin','moderator','staff')) THEN
    RAISE EXCEPTION 'Staff access required' USING errcode='42501';
  END IF;
  SELECT * INTO file FROM public.idea_update_uploads WHERE id=p_file_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evidence not found' USING errcode='P0002'; END IF;
  IF file.actor_id IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Evidence belongs to another account' USING errcode='42501'; END IF;
  IF file.update_id IS NOT NULL OR file.state='published' THEN RAISE EXCEPTION 'Published evidence is immutable' USING errcode='22023'; END IF;
  UPDATE public.idea_update_uploads SET state=CASE WHEN state='deleted' THEN 'deleted' ELSE 'delete_pending' END WHERE id=p_file_id RETURNING * INTO file;
  RETURN file;
END; $$;

-- Locks draft allocation before publication, so late reservations cannot escape the quota/ready check.
CREATE FUNCTION public.attach_progress_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE draft public.idea_update_drafts%rowtype;
BEGIN
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
CREATE TRIGGER idea_updates_attach_evidence AFTER INSERT ON public.idea_updates FOR EACH ROW EXECUTE FUNCTION public.attach_progress_evidence();

CREATE FUNCTION public.read_public_idea_update_files(p_submission_id uuid)
RETURNS TABLE(id uuid,update_id uuid,display_name text,mime_type text,size_bytes integer,alt text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.id,f.update_id,f.display_name,f.mime_type,f.size_bytes,f.alt
  FROM public.idea_update_uploads f JOIN public.idea_updates u ON u.id=f.update_id JOIN public.submissions s ON s.id=u.submission_id
  WHERE s.id=p_submission_id AND s.status::text IN ('approved','in_progress','resolved')
    AND u.visibility='public' AND u.deleted_at IS NULL AND f.state='published'
  ORDER BY f.created_at,f.id LIMIT 500;
$$;

-- Keep storage paths even when parents are deleted; cleanup retries until the objects are gone.
CREATE FUNCTION public.claim_progress_upload_cleanup(p_limit integer DEFAULT 50)
RETURNS SETOF public.idea_update_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY WITH candidates AS (
    SELECT id FROM public.idea_update_uploads
    WHERE state='delete_pending' OR (update_id IS NULL AND expires_at<=clock_timestamp() AND state<>'deleted')
    ORDER BY expires_at LIMIT least(greatest(p_limit,1),50) FOR UPDATE SKIP LOCKED
  ) UPDATE public.idea_update_uploads f SET state='delete_pending' FROM candidates c WHERE f.id=c.id RETURNING f.*;
END; $$;
CREATE FUNCTION public.finish_progress_upload_cleanup(p_file_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.idea_update_uploads SET state='deleted' WHERE id=p_file_id AND state='delete_pending';
END; $$;

REVOKE ALL ON FUNCTION public.reserve_progress_upload(uuid,uuid,text,text,integer,text),
  public.finalize_progress_upload(uuid,uuid,text,text,integer),public.cancel_progress_upload(uuid,uuid),
  public.claim_progress_upload_cleanup(integer),public.finish_progress_upload_cleanup(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_progress_upload(uuid,uuid,text,text,integer,text),
  public.finalize_progress_upload(uuid,uuid,text,text,integer),public.cancel_progress_upload(uuid,uuid),
  public.claim_progress_upload_cleanup(integer),public.finish_progress_upload_cleanup(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.read_public_idea_update_files(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.read_public_idea_update_files(uuid) TO anon,authenticated,service_role;
COMMIT;
