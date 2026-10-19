BEGIN;
CREATE TABLE public.school_asset_deletions (
 bucket text NOT NULL CHECK(bucket IN('school-upload-sources','school-branding','submission-attachments')),
 storage_path text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(bucket,storage_path)
);
ALTER TABLE public.school_asset_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_asset_deletions FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE FUNCTION public.queue_school_asset_deletion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.school_asset_deletions(bucket,storage_path) VALUES(CASE TG_TABLE_NAME WHEN 'school_brand_assets' THEN 'school-branding' ELSE 'submission-attachments' END,OLD.storage_path) ON CONFLICT DO NOTHING;
 RETURN OLD;
END $$;
CREATE TRIGGER school_brand_asset_deleted AFTER DELETE ON public.school_brand_assets FOR EACH ROW EXECUTE FUNCTION public.queue_school_asset_deletion();
CREATE TRIGGER school_submission_asset_deleted AFTER DELETE ON public.submission_uploads FOR EACH ROW EXECUTE FUNCTION public.queue_school_asset_deletion();
CREATE FUNCTION public.acknowledge_school_asset_deletion(p_bucket text,p_paths text[]) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 DELETE FROM public.school_asset_deletions WHERE bucket=p_bucket AND storage_path=ANY(p_paths)
$$;

CREATE FUNCTION public.discard_submission_upload(p_school uuid,p_owner text,p_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE path text;
BEGIN DELETE FROM public.submission_uploads WHERE school_id=p_school AND owner_hash=p_owner AND id=p_id AND submission_id IS NULL RETURNING storage_path INTO path;RETURN path;END $$;
CREATE FUNCTION public.cleanup_school_customization_uploads() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE asset public.school_brand_assets;paths jsonb:='[]';row record;
BEGIN
 FOR row IN DELETE FROM public.school_upload_intents WHERE expires_at<now() RETURNING school_id,id,purpose,completed_at LOOP
 INSERT INTO public.school_asset_deletions(bucket,storage_path) VALUES('school-upload-sources',row.school_id::text||'/'||row.id::text) ON CONFLICT DO NOTHING;
 IF row.completed_at IS NULL THEN INSERT INTO public.school_asset_deletions(bucket,storage_path) VALUES(CASE WHEN row.purpose='submission' THEN 'submission-attachments' ELSE 'school-branding' END,row.school_id::text||'/'||row.id::text||'.webp') ON CONFLICT DO NOTHING; END IF;
 END LOOP;
 FOR row IN DELETE FROM public.submission_uploads WHERE submission_id IS NULL AND expires_at<now() RETURNING storage_path LOOP paths:=paths||jsonb_build_array(jsonb_build_object('bucket','submission-attachments','path',row.storage_path)); END LOOP;
 FOR asset IN SELECT a.* FROM public.school_brand_assets a WHERE a.created_at<now()-interval '1 day'
 AND NOT EXISTS(SELECT 1 FROM public.school_customization_state s WHERE s.school_id=a.school_id AND (s.draft->>'logo'=a.id::text OR s.draft->>'cover'=a.id::text))
 AND NOT EXISTS(SELECT 1 FROM public.school_customization_versions v WHERE v.school_id=a.school_id AND (v.configuration->>'logo'=a.id::text OR v.configuration->>'cover'=a.id::text)) ORDER BY a.school_id,a.id LIMIT 100 LOOP
  -- Saving/publishing locks this school, so a live reference cannot race cleanup.
  PERFORM 1 FROM public.schools WHERE id=asset.school_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.school_customization_state WHERE school_id=asset.school_id AND (draft->>'logo'=asset.id::text OR draft->>'cover'=asset.id::text)) AND NOT EXISTS(SELECT 1 FROM public.school_customization_versions WHERE school_id=asset.school_id AND (configuration->>'logo'=asset.id::text OR configuration->>'cover'=asset.id::text)) THEN
   DELETE FROM public.school_brand_assets WHERE id=asset.id;paths:=paths||jsonb_build_array(jsonb_build_object('bucket','school-branding','path',asset.storage_path));
  END IF;
 END LOOP;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'path',storage_path)),'[]'::jsonb) FROM (SELECT * FROM public.school_asset_deletions ORDER BY created_at LIMIT 1000) pending);
END $$;
REVOKE ALL ON FUNCTION public.queue_school_asset_deletion(),public.acknowledge_school_asset_deletion(text,text[]),public.discard_submission_upload(uuid,text,uuid),public.cleanup_school_customization_uploads() FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT EXECUTE ON FUNCTION public.acknowledge_school_asset_deletion(text,text[]),public.discard_submission_upload(uuid,text,uuid),public.cleanup_school_customization_uploads() TO service_role;
COMMIT;
