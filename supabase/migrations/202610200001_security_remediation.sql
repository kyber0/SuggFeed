BEGIN;
-- Shared publication generations invalidate every application instance atomically.
CREATE TABLE public.school_content_revisions (
 school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
ALTER TABLE public.school_content_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_content_revisions FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
INSERT INTO public.school_content_revisions(school_id) SELECT id FROM public.schools;
CREATE FUNCTION public.bump_school_content_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.school_content_revisions(school_id,revision)
 VALUES(CASE WHEN TG_OP='DELETE' THEN OLD.school_id ELSE NEW.school_id END,1)
 ON CONFLICT(school_id) DO UPDATE SET revision=school_content_revisions.revision+1;
 RETURN NULL;
END $$;
CREATE TRIGGER school_content_changed AFTER INSERT OR DELETE OR UPDATE OF title,description,status,category_id,user_id ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.bump_school_content_revision();
DO $$ DECLARE relation text;BEGIN
 FOREACH relation IN ARRAY ARRAY['comments','categories','idea_updates','idea_merges','status_history'] LOOP
  EXECUTE format('CREATE TRIGGER school_content_changed AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_school_content_revision()',relation);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.bump_school_content_revision() FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE OR REPLACE FUNCTION public.school_presentation(p_slug text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT to_jsonb(s)||jsonb_build_object(
 'configuration',public.school_published_configuration(s.id),
 'customization_version',coalesce((SELECT published_version FROM public.school_customization_state WHERE school_id=s.id),0),
 'content_revision',coalesce((SELECT revision FROM public.school_content_revisions WHERE school_id=s.id),0)::text)
 FROM public.schools s WHERE s.slug=p_slug
$$;

-- Never release new unscanned PDFs through a bypassed/stale browser or RPC.
CREATE FUNCTION public.block_unscanned_progress_pdf() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.declared_mime='application/pdf' OR NEW.mime_type='application/pdf' THEN
  RAISE EXCEPTION 'New PDF evidence is paused until malware scanning is available' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER progress_pdf_quarantine BEFORE INSERT OR UPDATE OF declared_mime,mime_type,state ON public.idea_update_uploads
FOR EACH ROW WHEN (NEW.state IN('pending','ready','published')) EXECUTE FUNCTION public.block_unscanned_progress_pdf();
REVOKE ALL ON FUNCTION public.block_unscanned_progress_pdf() FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
UPDATE storage.buckets SET allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'] WHERE id='idea-update-evidence';

-- Expired sessions contain no active account authority; purge in bounded batches.
CREATE FUNCTION public.purge_expired_web_sessions(p_limit integer DEFAULT 1000) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE removed integer;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Invalid cleanup batch' USING ERRCODE='22023';END IF;
 WITH expired AS (SELECT id FROM public.web_sessions WHERE expires_at<now() ORDER BY expires_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
 DELETE FROM public.web_sessions s USING expired e WHERE s.id=e.id;
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN jsonb_build_object('removed',removed,'more',EXISTS(SELECT 1 FROM public.web_sessions WHERE expires_at<now()));
END $$;
REVOKE ALL ON FUNCTION public.purge_expired_web_sessions(integer) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT EXECUTE ON FUNCTION public.purge_expired_web_sessions(integer) TO service_role;

-- Report only: school records cannot be erased without a reviewed disposal/hold procedure.
CREATE FUNCTION public.school_retention_inventory() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('school_id',s.school_id,'retention_days',s.retention_days,
 'policy_reviewed',s.approved_at IS NOT NULL,'eligible_ideas',
 (SELECT count(*) FROM public.submissions i WHERE i.school_id=s.school_id AND i.created_at<now()-make_interval(days=>s.retention_days)),
 'execution','blocked_pending_disposal_and_legal_hold_approval')),'[]'::jsonb) FROM public.school_settings s
$$;
REVOKE ALL ON FUNCTION public.school_retention_inventory() FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT EXECUTE ON FUNCTION public.school_retention_inventory() TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user(),public.handle_user_email_updated() FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.handle_new_user() SET search_path=pg_catalog,public;
ALTER FUNCTION public.handle_user_email_updated() SET search_path=pg_catalog,public;
COMMIT;
