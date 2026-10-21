BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.school_enrollment_rules
 ADD COLUMN requests_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN roster_join_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE public.school_access_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 email text NOT NULL CHECK(email=lower(email) AND length(email)<=254),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 review_reference text CHECK(length(review_reference)<=1000),
 UNIQUE(school_id,user_id)
);
CREATE INDEX school_access_requests_queue ON public.school_access_requests(school_id,requested_at,id) WHERE status='pending';
CREATE INDEX school_access_requests_pending_actor ON public.school_access_requests(user_id) WHERE status='pending';
CREATE INDEX school_access_requests_actor ON public.school_access_requests(user_id,requested_at);
ALTER TABLE public.school_access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_access_requests FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
ALTER TABLE public.school_registry_events DROP CONSTRAINT school_registry_events_action_check;
ALTER TABLE public.school_registry_events ADD CONSTRAINT school_registry_events_action_check CHECK(action IN('created','status_changed','membership_changed','domain_requested','domain_verified','domain_enabled','domain_disabled','domain_removed','enrollment_changed','customization_saved','customization_published','customization_restored','customization_rollout','customization_reviewed','joining_settings_changed','join_requested','join_reviewed'));

CREATE FUNCTION public.get_school_student_access(p_school uuid,p_actor uuid,p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_page IS NULL OR p_page NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Invalid request page' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.school_memberships m JOIN public.schools s ON s.id=m.school_id WHERE s.id=p_school AND s.status<>'closed' AND m.user_id=p_actor AND m.role='admin' AND m.status='active') THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'version',coalesce((SELECT version FROM public.school_enrollment_rules WHERE school_id=p_school),0),
 'requests_enabled',coalesce((SELECT requests_enabled FROM public.school_enrollment_rules WHERE school_id=p_school),false),
 'roster_join_enabled',coalesce((SELECT roster_join_enabled FROM public.school_enrollment_rules WHERE school_id=p_school),false),
 'mode',coalesce((SELECT mode FROM public.school_enrollment_rules WHERE school_id=p_school),'email'),
 'roster_count',(SELECT count(*) FROM public.school_enrollment_roster WHERE school_id=p_school),
 'pending_count',(SELECT count(*) FROM public.school_access_requests WHERE school_id=p_school AND status='pending'),
 'requests',(SELECT coalesce(jsonb_agg(to_jsonb(queue) ORDER BY queue.requested_at,queue.id),'[]'::jsonb) FROM (
   SELECT r.id,r.email,r.requested_at,
    EXISTS(SELECT 1 FROM auth.users u WHERE u.id=r.user_id AND u.email_confirmed_at IS NOT NULL AND lower(u.email)=r.email) AS email_current,
    public.school_student_eligible(p_school,r.user_id) AS eligible
   FROM public.school_access_requests r WHERE r.school_id=p_school AND r.status='pending' ORDER BY r.requested_at,r.id LIMIT 50 OFFSET p_page*50
 ) queue));
END $$;
CREATE FUNCTION public.save_school_student_joining(p_school uuid,p_actor uuid,p_version integer,p_requests boolean,p_roster boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous_version integer;
BEGIN
 PERFORM 1 FROM public.schools WHERE id=p_school AND status<>'closed' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=p_actor AND role='admin' AND status='active') THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 IF p_requests IS NULL OR p_roster IS NULL THEN RAISE EXCEPTION 'Choose joining settings' USING ERRCODE='22023'; END IF;
 SELECT coalesce((SELECT version FROM public.school_enrollment_rules WHERE school_id=p_school),0) INTO previous_version;
 IF p_version IS DISTINCT FROM previous_version THEN RAISE EXCEPTION 'Enrollment settings changed; reload first' USING ERRCODE='40001'; END IF;
 INSERT INTO public.school_enrollment_rules(school_id,mode,version,requests_enabled,roster_join_enabled) VALUES(p_school,'email',previous_version+1,p_requests,p_roster)
 ON CONFLICT(school_id) DO UPDATE SET requests_enabled=excluded.requests_enabled,roster_join_enabled=excluded.roster_join_enabled,version=excluded.version,updated_at=now();
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail) VALUES(p_school,p_actor,'joining_settings_changed',jsonb_build_object('requests_enabled',p_requests,'roster_join_enabled',p_roster,'version',previous_version+1));
END $$;

CREATE FUNCTION public.school_student_access_options(p_actor uuid,p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE confirmed_email text;
BEGIN
 IF p_search IS NULL OR length(p_search)>100 THEN RAISE EXCEPTION 'Invalid school search' USING ERRCODE='22023'; END IF;
 SELECT lower(email) INTO confirmed_email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL;
 IF confirmed_email IS NULL OR public.platform_operator_active(p_actor) THEN RETURN jsonb_build_object('confirmed',false,'roster','[]'::jsonb,'discover','[]'::jsonb,'requests','[]'::jsonb); END IF;
 RETURN jsonb_build_object('confirmed',true,
 'roster',(SELECT coalesce(jsonb_agg(to_jsonb(matches) ORDER BY matches.name),'[]'::jsonb) FROM (
  SELECT s.id,s.name,s.slug FROM public.schools s JOIN public.school_enrollment_rules j ON j.school_id=s.id
  JOIN public.school_enrollment_roster r ON r.school_id=s.id AND r.email=confirmed_email
  WHERE j.roster_join_enabled AND s.status='active'
  AND EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=s.id AND approved_at IS NOT NULL)
  AND EXISTS(SELECT 1 FROM public.school_release_gate WHERE singleton AND isolation_verified)
  AND NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=s.id AND user_id=p_actor)
  ORDER BY s.name,s.id LIMIT 20
 ) matches),
 'discover',(SELECT coalesce(jsonb_agg(to_jsonb(matches) ORDER BY matches.name),'[]'::jsonb) FROM (
  SELECT s.id,s.name,s.slug FROM public.schools s JOIN public.school_enrollment_rules j ON j.school_id=s.id
  WHERE j.requests_enabled AND s.status='active' AND length(btrim(p_search))>=2 AND position(lower(btrim(p_search)) IN lower(s.name))>0
  AND EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=s.id AND approved_at IS NOT NULL)
  AND EXISTS(SELECT 1 FROM public.school_release_gate WHERE singleton AND isolation_verified)
  AND NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=s.id AND user_id=p_actor)
  AND NOT EXISTS(SELECT 1 FROM public.school_access_requests WHERE school_id=s.id AND user_id=p_actor)
  AND NOT (j.roster_join_enabled AND EXISTS(SELECT 1 FROM public.school_enrollment_roster WHERE school_id=s.id AND email=confirmed_email))
  ORDER BY s.name,s.id LIMIT 20
 ) matches),
 'requests',(SELECT coalesce(jsonb_agg(to_jsonb(requests) ORDER BY requests.requested_at DESC),'[]'::jsonb) FROM (
  SELECT r.id,r.status,r.email,r.requested_at,s.name,s.slug,s.status AS school_status FROM public.school_access_requests r JOIN public.schools s ON s.id=r.school_id WHERE r.user_id=p_actor ORDER BY r.requested_at DESC,r.id LIMIT 20
 ) requests));
END $$;

CREATE FUNCTION public.request_school_student_access(p_school uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE confirmed_email text; existing public.school_access_requests;
BEGIN
 -- Serialize the account-wide pending-request budget, then the school's settings.
 PERFORM pg_advisory_xact_lock(hashtextextended('student-request:'||p_actor::text,0));
 PERFORM 1 FROM public.schools WHERE id=p_school AND status='active' FOR UPDATE;
 IF NOT FOUND OR public.platform_operator_active(p_actor)
  OR NOT EXISTS(SELECT 1 FROM public.school_enrollment_rules WHERE school_id=p_school AND requests_enabled)
  OR NOT EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=p_school AND approved_at IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM public.school_release_gate WHERE singleton AND isolation_verified) THEN RAISE EXCEPTION 'School requests unavailable' USING ERRCODE='42501'; END IF;
 SELECT lower(email) INTO confirmed_email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL FOR SHARE;
 IF confirmed_email IS NULL OR EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=p_actor) THEN RAISE EXCEPTION 'Verified non-member account required' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM public.school_access_requests WHERE school_id=p_school AND user_id=p_actor;
 IF existing.status='pending' THEN RETURN; END IF;
 IF existing.id IS NOT NULL THEN RAISE EXCEPTION 'Request already reviewed; contact the school' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM public.school_access_requests WHERE user_id=p_actor AND status='pending')>=5
 OR (SELECT count(*) FROM public.school_access_requests WHERE user_id=p_actor AND requested_at>now()-interval '1 day')>=20 THEN RAISE EXCEPTION 'Access request limit reached' USING ERRCODE='54000'; END IF;
 INSERT INTO public.school_access_requests(school_id,user_id,email) VALUES(p_school,p_actor,confirmed_email);
 INSERT INTO public.school_registry_events(school_id,actor_id,action,subject_id,detail) VALUES(p_school,p_actor,'join_requested',p_actor,'{}'::jsonb);
END $$;

CREATE FUNCTION public.join_school_by_roster(p_school uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE school public.schools; confirmed_email text; existing public.school_memberships;
BEGIN
 SELECT * INTO school FROM public.schools WHERE id=p_school FOR UPDATE;
 SELECT lower(email) INTO confirmed_email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL FOR SHARE;
 IF school.id IS NULL OR school.status<>'active' OR confirmed_email IS NULL OR public.platform_operator_active(p_actor)
 OR NOT EXISTS(SELECT 1 FROM public.school_enrollment_rules WHERE school_id=p_school AND roster_join_enabled)
 OR NOT EXISTS(SELECT 1 FROM public.school_enrollment_roster WHERE school_id=p_school AND email=confirmed_email)
 OR NOT EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=p_school AND approved_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM public.school_release_gate WHERE singleton AND isolation_verified) THEN RAISE EXCEPTION 'Approved email and eligible school required' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM public.school_memberships WHERE school_id=p_school AND user_id=p_actor;
 IF existing.status='revoked' THEN RAISE EXCEPTION 'Membership revoked; contact the school' USING ERRCODE='42501'; END IF;
 IF existing.user_id IS NULL THEN
  INSERT INTO public.school_memberships(school_id,user_id,role,status) VALUES(p_school,p_actor,'student','active');
  INSERT INTO public.school_registry_events(school_id,actor_id,action,subject_id,detail) VALUES(p_school,p_actor,'membership_changed',p_actor,jsonb_build_object('role','student','status','active','method','approved_email_roster'));
 END IF;
 UPDATE public.school_access_requests SET status='approved',reviewed_at=now(),review_reference='Joined using the school approved email roster.' WHERE school_id=p_school AND user_id=p_actor AND status='pending';
 RETURN jsonb_build_object('slug',school.slug,'status',school.status,'role',coalesce(existing.role,'student'));
END $$;

CREATE FUNCTION public.review_school_access_requests(p_school uuid,p_actor uuid,p_requests uuid[],p_decision text,p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE school public.schools; request public.school_access_requests; confirmed_email text; existing public.school_memberships;
BEGIN
 IF p_requests IS NULL OR cardinality(p_requests) NOT BETWEEN 1 AND 50 OR array_ndims(p_requests)<>1
 OR EXISTS(SELECT 1 FROM unnest(p_requests) id WHERE id IS NULL) OR (SELECT count(DISTINCT id) FROM unnest(p_requests) id)<>cardinality(p_requests)
 OR p_decision IS NULL OR p_decision NOT IN('approved','rejected') OR p_reference IS NULL OR length(btrim(p_reference)) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Select 1–50 requests and record a review reference' USING ERRCODE='22023'; END IF;
 SELECT * INTO school FROM public.schools WHERE id=p_school FOR UPDATE;
 IF school.id IS NULL OR school.status='closed' OR NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=p_actor AND role='admin' AND status='active') THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 IF p_decision='approved' AND (school.status<>'active'
 OR NOT EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=p_school AND approved_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM public.school_release_gate WHERE singleton AND isolation_verified)) THEN RAISE EXCEPTION 'School activation checks required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.school_access_requests WHERE school_id=p_school AND id=ANY(p_requests) ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public.school_access_requests WHERE school_id=p_school AND id=ANY(p_requests) AND status='pending')<>cardinality(p_requests) THEN RAISE EXCEPTION 'Request selection changed; reload' USING ERRCODE='40001'; END IF;
 FOR request IN SELECT * FROM public.school_access_requests WHERE school_id=p_school AND id=ANY(p_requests) ORDER BY id LOOP
  IF p_decision='approved' THEN
   SELECT lower(email) INTO confirmed_email FROM auth.users WHERE id=request.user_id AND email_confirmed_at IS NOT NULL FOR SHARE;
   IF confirmed_email IS DISTINCT FROM request.email OR public.platform_operator_active(request.user_id) OR NOT public.school_student_eligible(p_school,request.user_id) THEN RAISE EXCEPTION 'Current verified email and roster eligibility required for every selected request' USING ERRCODE='42501'; END IF;
   SELECT * INTO existing FROM public.school_memberships WHERE school_id=p_school AND user_id=request.user_id;
   IF existing.status='revoked' OR (existing.user_id IS NOT NULL AND existing.role<>'student') THEN RAISE EXCEPTION 'Existing membership requires separate administration' USING ERRCODE='42501'; END IF;
   IF existing.user_id IS NULL THEN
    INSERT INTO public.school_memberships(school_id,user_id,role,status) VALUES(p_school,request.user_id,'student','active');
    INSERT INTO public.school_registry_events(school_id,actor_id,action,subject_id,detail) VALUES(p_school,p_actor,'membership_changed',request.user_id,jsonb_build_object('role','student','status','active','method','approved_access_request'));
   END IF;
  END IF;
  UPDATE public.school_access_requests SET status=p_decision,reviewed_at=now(),reviewed_by=p_actor,review_reference=btrim(p_reference) WHERE id=request.id;
 END LOOP;
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail) VALUES(p_school,p_actor,'join_reviewed',jsonb_build_object('request_ids',to_jsonb(p_requests),'decision',p_decision,'reference',btrim(p_reference)));
END $$;
REVOKE ALL ON FUNCTION public.get_school_student_access(uuid,uuid,integer),public.save_school_student_joining(uuid,uuid,integer,boolean,boolean),public.school_student_access_options(uuid,text),public.request_school_student_access(uuid,uuid),public.join_school_by_roster(uuid,uuid),public.review_school_access_requests(uuid,uuid,uuid[],text,text) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT EXECUTE ON FUNCTION public.get_school_student_access(uuid,uuid,integer),public.save_school_student_joining(uuid,uuid,integer,boolean,boolean),public.school_student_access_options(uuid,text),public.request_school_student_access(uuid,uuid),public.join_school_by_roster(uuid,uuid),public.review_school_access_requests(uuid,uuid,uuid[],text,text) TO service_role;
COMMIT;
