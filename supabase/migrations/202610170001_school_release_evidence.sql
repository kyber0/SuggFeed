-- Record a reviewed release without giving the application permission to unlock it.
BEGIN;
ALTER TABLE public.school_release_gate
 ADD COLUMN verified_at timestamptz,
 ADD COLUMN verified_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 ADD COLUMN verification_reference text;
ALTER TABLE public.school_release_gate ADD CONSTRAINT school_release_evidence_required CHECK(
 NOT isolation_verified OR (verified_at IS NOT NULL AND verified_by IS NOT NULL AND verification_reference IS NOT NULL AND length(btrim(verification_reference))>=10)
);
CREATE FUNCTION public.school_release_status(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('isolation_verified',isolation_verified,'verified_at',verified_at,'verification_reference',verification_reference) FROM public.school_release_gate WHERE singleton);
END $$;
REVOKE ALL ON FUNCTION public.school_release_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.school_release_status(uuid) TO service_role;
COMMIT;
