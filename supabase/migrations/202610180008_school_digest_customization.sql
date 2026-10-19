BEGIN;
CREATE FUNCTION public.school_digest_available(p_school uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.school_published_configuration(p_school)->'email'->>'digest'='weekly'
$$;
REVOKE ALL ON FUNCTION public.school_digest_available(uuid) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT EXECUTE ON FUNCTION public.school_digest_available(uuid) TO tenant_executor,service_role;
DO $$ DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('public.claim_weekly_digests()'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,'\mBEGIN\M',E'BEGIN\n IF NOT public.school_digest_available(public.tenant_school_id()) THEN RETURN; END IF;','i');
 EXECUTE definition;
END $$;
COMMIT;
