BEGIN;
-- Keep confirmation, stale-state detection, status changes and audit evidence atomic.
CREATE FUNCTION public.manage_school_status(p_school uuid,p_actor uuid,p_status text,p_expected_status text,p_confirmation text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE school public.schools;
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN
  RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501';
 END IF;
 IF p_status IS NULL OR p_status NOT IN('active','suspended','closed') OR p_expected_status IS NULL OR p_expected_status NOT IN('pending','active','suspended')
  OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 2000 THEN
  RAISE EXCEPTION 'A valid change and reason are required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO school FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School not found' USING ERRCODE='P0002'; END IF;
 IF school.status IS DISTINCT FROM p_expected_status THEN
  RAISE EXCEPTION 'School status changed; review it again' USING ERRCODE='40001';
 END IF;
 IF p_confirmation IS DISTINCT FROM school.slug THEN
  RAISE EXCEPTION 'School confirmation does not match' USING ERRCODE='22023';
 END IF;
 IF NOT ((p_status='suspended' AND school.status='active')
  OR (p_status='active' AND school.status IN('pending','suspended'))
  OR (p_status='closed' AND school.status IN('pending','active','suspended'))) THEN
  RAISE EXCEPTION 'School status transition is unavailable' USING ERRCODE='22023';
 END IF;
 IF p_status='active' AND NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND role='admin' AND status='active') THEN
  RAISE EXCEPTION 'An active school administrator is required' USING ERRCODE='42501';
 END IF;
 -- The existing activation trigger checks reviewed policies and the isolation gate.
 UPDATE public.schools SET status=p_status,updated_at=clock_timestamp() WHERE id=p_school;
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail)
 VALUES(p_school,p_actor,'status_changed',jsonb_build_object('previous',school.status,'status',p_status,'reason',btrim(p_reason)));
END $$;
REVOKE ALL ON FUNCTION public.manage_school_status(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT EXECUTE ON FUNCTION public.manage_school_status(uuid,uuid,text,text,text,text) TO service_role;
COMMIT;
