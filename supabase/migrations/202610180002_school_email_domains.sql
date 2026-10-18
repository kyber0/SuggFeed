-- Exact-domain student enrollment. School/domain ownership and mailbox verification
-- are independent checks. Public/authenticated clients cannot call these RPCs.
BEGIN;
CREATE TABLE public.school_email_domains (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 domain text NOT NULL CHECK(length(domain)<=243 AND domain=lower(domain)
  AND domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
  AND domain NOT IN('gmail.com','googlemail.com','yahoo.com','yahoo.com.ph','ymail.com','outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com','aol.com','proton.me','protonmail.com','mail.com')),
 verification_token text NOT NULL CHECK(verification_token ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz,
 join_enabled boolean NOT NULL DEFAULT false CHECK(NOT join_enabled OR verified_at IS NOT NULL),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,domain)
);
-- Unverified requests cannot reserve someone else's domain indefinitely.
CREATE UNIQUE INDEX school_verified_email_domain_idx ON public.school_email_domains(domain) WHERE verified_at IS NOT NULL;
CREATE INDEX school_email_domains_school_idx ON public.school_email_domains(school_id);
ALTER TABLE public.school_email_domains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_email_domains FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.school_email_domains TO service_role;
ALTER TABLE public.school_registry_events DROP CONSTRAINT school_registry_events_action_check;
ALTER TABLE public.school_registry_events ADD CONSTRAINT school_registry_events_action_check CHECK(action IN('created','status_changed','membership_changed','domain_requested','domain_verified','domain_enabled','domain_disabled','domain_removed'));

CREATE FUNCTION public.request_school_email_domain(p_school uuid,p_actor uuid,p_domain text,p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.schools WHERE id=p_school AND status<>'closed' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=p_actor AND status='active' AND role='admin') THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM public.school_email_domains WHERE school_id=p_school)>=10 THEN RAISE EXCEPTION 'At most ten email domains per school' USING ERRCODE='22023'; END IF;
 INSERT INTO public.school_email_domains(school_id,domain,verification_token) VALUES(p_school,p_domain,p_token);
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail) VALUES(p_school,p_actor,'domain_requested',jsonb_build_object('domain',p_domain));
END $$;

CREATE FUNCTION public.configure_school_email_domain(p_school uuid,p_actor uuid,p_domain uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE registration public.school_email_domains;
BEGIN
 PERFORM 1 FROM public.schools WHERE id=p_school AND status<>'closed' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=p_actor AND status='active' AND role='admin') THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 SELECT * INTO registration FROM public.school_email_domains WHERE id=p_domain AND school_id=p_school FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Domain unavailable' USING ERRCODE='P0002'; END IF;
 CASE p_action
 WHEN 'verify' THEN UPDATE public.school_email_domains SET verified_at=now() WHERE id=p_domain;
 WHEN 'enable' THEN
  IF registration.verified_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.schools WHERE id=p_school AND status='active') OR NOT EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=p_school AND approved_at IS NOT NULL) THEN RAISE EXCEPTION 'Verified domain and active, reviewed school required' USING ERRCODE='42501'; END IF;
  UPDATE public.school_email_domains SET join_enabled=true WHERE id=p_domain;
 WHEN 'disable' THEN UPDATE public.school_email_domains SET join_enabled=false WHERE id=p_domain;
 WHEN 'remove' THEN DELETE FROM public.school_email_domains WHERE id=p_domain;
 ELSE RAISE EXCEPTION 'Invalid domain action' USING ERRCODE='22023';
 END CASE;
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail) VALUES(p_school,p_actor,CASE p_action WHEN 'verify' THEN 'domain_verified' WHEN 'enable' THEN 'domain_enabled' WHEN 'disable' THEN 'domain_disabled' ELSE 'domain_removed' END,jsonb_build_object('domain',registration.domain));
END $$;

CREATE FUNCTION public.school_email_join_options(p_actor uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'domain',d.domain,'name',s.name,'slug',s.slug) ORDER BY s.name),'[]'::jsonb)
 FROM public.school_email_domains d JOIN public.schools s ON s.id=d.school_id
 JOIN auth.users u ON u.id=p_actor AND u.email_confirmed_at IS NOT NULL AND lower(split_part(u.email,'@',2))=d.domain
 WHERE d.verified_at IS NOT NULL AND d.join_enabled AND s.status='active'
 AND EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=s.id AND approved_at IS NOT NULL)
 AND EXISTS(SELECT 1 FROM public.school_release_gate WHERE singleton AND isolation_verified)
 AND NOT public.platform_operator_active(p_actor)
 AND NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=s.id AND user_id=p_actor)
$$;

CREATE FUNCTION public.join_school_by_email_domain(p_actor uuid,p_domain uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE registration public.school_email_domains; school public.schools; existing public.school_memberships; confirmed_email text;
BEGIN
 SELECT * INTO registration FROM public.school_email_domains WHERE id=p_domain;
 IF NOT FOUND THEN RAISE EXCEPTION 'School joining unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO school FROM public.schools WHERE id=registration.school_id FOR UPDATE;
 SELECT * INTO registration FROM public.school_email_domains WHERE id=p_domain FOR UPDATE;
 SELECT lower(email) INTO confirmed_email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL FOR SHARE;
 IF registration.id IS NULL OR registration.verified_at IS NULL OR NOT registration.join_enabled OR school.status<>'active'
 OR confirmed_email IS NULL OR split_part(confirmed_email,'@',2)<>registration.domain
 OR public.platform_operator_active(p_actor)
 OR NOT EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=school.id AND approved_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM public.school_release_gate WHERE singleton AND isolation_verified) THEN
  RAISE EXCEPTION 'Verified school email and eligible school required' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM public.school_memberships WHERE school_id=school.id AND user_id=p_actor FOR UPDATE;
 IF existing.status='revoked' THEN RAISE EXCEPTION 'Contact the school administrator about your access' USING ERRCODE='42501'; END IF;
 IF existing.user_id IS NULL THEN
  INSERT INTO public.school_memberships(school_id,user_id,role,status) VALUES(school.id,p_actor,'student','active');
  INSERT INTO public.school_registry_events(school_id,actor_id,action,subject_id,detail) VALUES(school.id,p_actor,'membership_changed',p_actor,jsonb_build_object('role','student','status','active','method','verified_email_domain','domain',registration.domain));
 END IF;
 RETURN jsonb_build_object('slug',school.slug,'status',school.status,'role',coalesce(existing.role,'student'));
END $$;
REVOKE ALL ON FUNCTION public.request_school_email_domain(uuid,uuid,text,text),public.configure_school_email_domain(uuid,uuid,uuid,text),public.school_email_join_options(uuid),public.join_school_by_email_domain(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.request_school_email_domain(uuid,uuid,text,text),public.configure_school_email_domain(uuid,uuid,uuid,text),public.school_email_join_options(uuid),public.join_school_by_email_domain(uuid,uuid) TO service_role;
COMMIT;
