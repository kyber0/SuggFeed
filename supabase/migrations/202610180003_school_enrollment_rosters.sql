-- Enrollment eligibility is separate from membership and never changes staff roles.
BEGIN;
CREATE TABLE public.school_enrollment_rules (
 school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE RESTRICT,
 mode text NOT NULL DEFAULT 'email' CHECK(mode IN('email','roster')),
 version integer NOT NULL CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.school_enrollment_roster (
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 email text NOT NULL CHECK(length(email)<=254 AND email=lower(email) AND email ~ '^[^[:space:]@<>(),;]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
 PRIMARY KEY(school_id,email)
);
ALTER TABLE public.school_enrollment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_enrollment_roster ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_enrollment_rules,public.school_enrollment_roster FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
ALTER TABLE public.school_registry_events DROP CONSTRAINT school_registry_events_action_check;
ALTER TABLE public.school_registry_events ADD CONSTRAINT school_registry_events_action_check CHECK(action IN('created','status_changed','membership_changed','domain_requested','domain_verified','domain_enabled','domain_disabled','domain_removed','enrollment_changed'));

CREATE FUNCTION public.school_student_eligible(p_school uuid,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.school_enrollment_rules WHERE school_id=p_school AND mode='roster')
 OR EXISTS(SELECT 1 FROM public.school_enrollment_roster r JOIN auth.users u ON u.id=p_actor AND u.email_confirmed_at IS NOT NULL AND lower(u.email)=r.email WHERE r.school_id=p_school)
$$;
CREATE OR REPLACE FUNCTION public.school_actor_has_role(p_school uuid,p_actor uuid,p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_memberships m JOIN public.schools s ON s.id=m.school_id
 WHERE m.school_id=p_school AND m.user_id=p_actor AND m.status='active' AND s.status='active' AND m.role=ANY(p_roles)
 AND (m.role<>'student' OR public.school_student_eligible(p_school,p_actor)))
$$;
CREATE OR REPLACE FUNCTION public.school_is_member(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=auth.uid() AND status='active'
 AND (role<>'student' OR public.school_student_eligible(p_school,auth.uid())))
$$;
CREATE FUNCTION public.school_account_memberships(p_actor uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('school_id',s.id,'role',m.role,'status',m.status,'eligible',m.role<>'student' OR public.school_student_eligible(s.id,p_actor),'schools',jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'status',s.status)) ORDER BY s.name),'[]'::jsonb)
 FROM public.school_memberships m JOIN public.schools s ON s.id=m.school_id WHERE m.user_id=p_actor AND m.status='active'
$$;
CREATE FUNCTION public.get_school_enrollment(p_school uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.school_memberships m JOIN public.schools s ON s.id=m.school_id WHERE m.school_id=p_school AND m.user_id=p_actor AND m.status='active' AND m.role='admin' AND s.status<>'closed') THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('mode',coalesce((SELECT mode FROM public.school_enrollment_rules WHERE school_id=p_school),'email'),'version',coalesce((SELECT version FROM public.school_enrollment_rules WHERE school_id=p_school),0),'emails',(SELECT coalesce(jsonb_agg(email ORDER BY email),'[]'::jsonb) FROM public.school_enrollment_roster WHERE school_id=p_school));
END $$;
CREATE FUNCTION public.save_school_enrollment(p_school uuid,p_actor uuid,p_version integer,p_mode text,p_emails text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous_version integer;
BEGIN
 PERFORM 1 FROM public.schools WHERE id=p_school AND status<>'closed' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=p_actor AND role='admin' AND status='active') THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN('email','roster') OR p_emails IS NULL OR cardinality(p_emails)>1000 OR array_ndims(p_emails)>1 OR EXISTS(SELECT 1 FROM unnest(p_emails) e WHERE e IS NULL OR length(e)>254 OR e<>lower(e) OR e !~ '^[^[:space:]@<>(),;]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$') THEN RAISE EXCEPTION 'Invalid roster or rule' USING ERRCODE='22023'; END IF;
 SELECT coalesce((SELECT version FROM public.school_enrollment_rules WHERE school_id=p_school),0) INTO previous_version;
 IF p_version IS DISTINCT FROM previous_version THEN RAISE EXCEPTION 'Roster changed; reload before replacing it' USING ERRCODE='40001'; END IF;
 DELETE FROM public.school_enrollment_roster WHERE school_id=p_school;
 INSERT INTO public.school_enrollment_roster(school_id,email) SELECT p_school,e FROM unnest(p_emails) e GROUP BY e;
 INSERT INTO public.school_enrollment_rules(school_id,mode,version) VALUES(p_school,p_mode,previous_version+1)
 ON CONFLICT(school_id) DO UPDATE SET mode=excluded.mode,version=excluded.version,updated_at=now();
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail) VALUES(p_school,p_actor,'enrollment_changed',jsonb_build_object('mode',p_mode,'version',previous_version+1,'email_count',(SELECT count(*) FROM public.school_enrollment_roster WHERE school_id=p_school)));
END $$;

CREATE OR REPLACE FUNCTION public.school_email_join_options(p_actor uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'domain',d.domain,'name',s.name,'slug',s.slug,'can_join',public.school_student_eligible(s.id,p_actor)) ORDER BY s.name),'[]'::jsonb)
 FROM public.school_email_domains d JOIN public.schools s ON s.id=d.school_id
 JOIN auth.users u ON u.id=p_actor AND u.email_confirmed_at IS NOT NULL AND lower(split_part(u.email,'@',2))=d.domain
 WHERE d.verified_at IS NOT NULL AND d.join_enabled AND s.status='active'
 AND EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=s.id AND approved_at IS NOT NULL)
 AND EXISTS(SELECT 1 FROM public.school_release_gate WHERE singleton AND isolation_verified)
 AND NOT public.platform_operator_active(p_actor)
 AND NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=s.id AND user_id=p_actor)
$$;
-- The existing join holds the school row lock, so roster replacement and joining serialize.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.join_school_by_email_domain(uuid,uuid)'::regprocedure) INTO definition;
 IF position('OR public.platform_operator_active(p_actor)' IN definition)=0 THEN RAISE EXCEPTION 'Domain join guard changed; review migration'; END IF;
 definition:=replace(definition,'OR public.platform_operator_active(p_actor)','OR public.platform_operator_active(p_actor) OR (NOT public.school_student_eligible(school.id,p_actor) AND NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=school.id AND user_id=p_actor AND status=''active'' AND role IN(''admin'',''moderator'')))');
 EXECUTE definition;
END $$;
-- Invitation entry points use the same student eligibility rule.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.school_invitation_preview(text,uuid)'::regprocedure) INTO definition;
 IF position('can_enter:=member_role IS NOT NULL' IN definition)=0 OR position('''can_enter'',can_enter);' IN definition)=0 THEN RAISE EXCEPTION 'Invitation preview changed; review migration'; END IF;
 definition:=replace(definition,'can_enter:=member_role IS NOT NULL', 'can_enter:=(member_role<>''student'' OR public.school_student_eligible(school.id,p_actor)) AND member_role IS NOT NULL');
 definition:=replace(definition,'''can_enter'',can_enter);','''can_enter'',can_enter,''enrollment_paused'',state IN(''pending'',''member'',''accepted'') AND school.status=''active'' AND coalesce(verified_email=invitation.email,false) AND coalesce(member_role,invitation.role)=''student'' AND NOT public.school_student_eligible(school.id,p_actor));');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.accept_school_invitation(uuid,text)'::regprocedure) INTO definition;
 IF position('RETURN public.accept_school_invitation_v1(p_actor,p_hash);' IN definition)=0 THEN RAISE EXCEPTION 'Invitation acceptance changed; review migration'; END IF;
 definition:=replace(definition,'RETURN public.accept_school_invitation_v1(p_actor,p_hash);','IF invitation.role=''student'' AND NOT public.school_student_eligible(invitation.school_id,p_actor) THEN RAISE EXCEPTION ''Current enrollment roster required'' USING ERRCODE=''42501''; END IF; RETURN public.accept_school_invitation_v1(p_actor,p_hash);');
 EXECUTE definition;
END $$;
REVOKE ALL ON FUNCTION public.school_student_eligible(uuid,uuid),public.school_account_memberships(uuid),public.get_school_enrollment(uuid,uuid),public.save_school_enrollment(uuid,uuid,integer,text,text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.school_student_eligible(uuid,uuid),public.school_account_memberships(uuid),public.get_school_enrollment(uuid,uuid),public.save_school_enrollment(uuid,uuid,integer,text,text[]) TO service_role;
COMMIT;
