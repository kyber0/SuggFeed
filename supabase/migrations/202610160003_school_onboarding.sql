-- Additive onboarding. No release gate change, operator grant, email delivery or production activation.
BEGIN;
CREATE TABLE public.school_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), applicant_id uuid NOT NULL REFERENCES public.profiles(id),
 slug text NOT NULL CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 63),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 200),
 contact_name text NOT NULL CHECK(length(btrim(contact_name)) BETWEEN 2 AND 200),
 contact_email text NOT NULL CHECK(length(contact_email)<=254),
 authority_statement text NOT NULL CHECK(length(btrim(authority_statement)) BETWEEN 20 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 school_id uuid REFERENCES public.schools(id), reviewed_by uuid REFERENCES public.profiles(id),
 review_reference text, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX school_application_pending_slug ON public.school_applications(slug) WHERE status='pending';
CREATE INDEX school_application_budget ON public.school_applications(created_at,applicant_id);
CREATE TABLE public.school_settings (
 school_id uuid PRIMARY KEY REFERENCES public.schools(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 privacy_notice text NOT NULL DEFAULT '' CHECK(length(privacy_notice)<=20000), terms_notice text NOT NULL DEFAULT '' CHECK(length(terms_notice)<=20000),
 privacy_contact text NOT NULL DEFAULT '' CHECK(length(privacy_contact)<=254), school_contact text NOT NULL DEFAULT '' CHECK(length(school_contact)<=254),
 age_policy text NOT NULL DEFAULT '' CHECK(length(age_policy)<=4000),
 publication_policy text NOT NULL DEFAULT 'private' CHECK(publication_policy IN('private','public')),
 retention_days integer NOT NULL DEFAULT 365 CHECK(retention_days BETWEEN 1 AND 3650),
 approval_reference text, approved_at timestamptz, approved_by uuid REFERENCES public.profiles(id),
 updated_by uuid NOT NULL REFERENCES public.profiles(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.school_settings_versions (
 school_id uuid NOT NULL REFERENCES public.schools(id), version integer NOT NULL,
 snapshot jsonb NOT NULL, changed_by uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id,version)
);
CREATE TABLE public.school_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES public.schools(id),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'), email text NOT NULL CHECK(length(email)<=254),
 role text NOT NULL CHECK(role IN('student','moderator','admin')), invited_by uuid NOT NULL REFERENCES public.profiles(id),
 expires_at timestamptz NOT NULL, accepted_at timestamptz, accepted_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX school_invitation_budget ON public.school_invitations(school_id,created_at);
ALTER TABLE public.school_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_applications,public.school_settings,public.school_settings_versions,public.school_invitations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.school_applications,public.school_settings,public.school_settings_versions TO service_role;

CREATE FUNCTION public.apply_to_school(p_actor uuid,p_slug text,p_name text,p_contact_name text,p_authority text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL AND email IS NOT NULL) THEN RAISE EXCEPTION 'Verified email required' USING ERRCODE='42501'; END IF;
 -- Serialize the shared budget across instances; rows themselves provide the bounded daily ledger.
 PERFORM pg_advisory_xact_lock(610160003);
 IF (SELECT count(*) FROM public.school_applications WHERE created_at>now()-interval '1 day')>=1000 OR
 (SELECT count(*) FROM public.school_applications WHERE applicant_id=p_actor AND created_at>now()-interval '1 day')>=3 THEN RAISE EXCEPTION 'Application limit reached' USING ERRCODE='54000'; END IF;
 INSERT INTO public.school_applications(applicant_id,slug,name,contact_name,contact_email,authority_statement)
 SELECT p_actor,p_slug,btrim(p_name),btrim(p_contact_name),lower(email),btrim(p_authority) FROM auth.users WHERE id=p_actor RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.review_school_application(p_application uuid,p_actor uuid,p_decision text,p_reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE application public.school_applications; result uuid;
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN('approved','rejected') OR p_decision IS NULL OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Review decision and reference required' USING ERRCODE='22023'; END IF;
 SELECT * INTO application FROM public.school_applications WHERE id=p_application FOR UPDATE;
 IF NOT FOUND OR application.status<>'pending' THEN RAISE EXCEPTION 'Pending application required' USING ERRCODE='22023'; END IF;
 IF p_decision='approved' THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=application.applicant_id AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Verified applicant required' USING ERRCODE='42501'; END IF;
  result:=public.create_pending_school(p_actor,application.slug,application.name);
  PERFORM public.change_school_membership(result,p_actor,application.applicant_id,'admin','active');
  INSERT INTO public.school_settings(school_id,updated_by) VALUES(result,p_actor);
 END IF;
 UPDATE public.school_applications SET status=p_decision,school_id=result,reviewed_by=p_actor,review_reference=btrim(p_reference),reviewed_at=now() WHERE id=p_application;
 RETURN result;
END $$;
CREATE FUNCTION public.update_school_settings(p_school uuid,p_actor uuid,p_version integer,p_settings jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE school_status text; current_version integer;
BEGIN
 SELECT status INTO school_status FROM public.schools WHERE id=p_school FOR UPDATE;
 IF school_status IS NULL OR school_status='closed' OR NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=p_actor AND role='admin' AND status='active') THEN RAISE EXCEPTION 'School admin required' USING ERRCODE='42501'; END IF;
 SELECT version INTO current_version FROM public.school_settings WHERE school_id=p_school FOR UPDATE;
 IF current_version IS NULL THEN INSERT INTO public.school_settings(school_id,updated_by) VALUES(p_school,p_actor); current_version:=1; END IF;
 IF p_version IS DISTINCT FROM current_version THEN RAISE EXCEPTION 'Settings changed; reload before saving' USING ERRCODE='40001'; END IF;
 IF length(btrim(coalesce(p_settings->>'privacy_notice','')))<20 OR length(btrim(coalesce(p_settings->>'terms_notice','')))<20 OR length(btrim(coalesce(p_settings->>'age_policy','')))<10 OR
 coalesce(p_settings->>'privacy_contact','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR coalesce(p_settings->>'school_contact','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'Complete notices, contacts and age policy required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.school_settings_versions(school_id,version,snapshot,changed_by) SELECT school_id,version,to_jsonb(s),p_actor FROM public.school_settings s WHERE school_id=p_school;
 UPDATE public.school_settings SET version=version+1, privacy_notice=p_settings->>'privacy_notice',terms_notice=p_settings->>'terms_notice',privacy_contact=p_settings->>'privacy_contact',school_contact=p_settings->>'school_contact',age_policy=p_settings->>'age_policy',publication_policy=p_settings->>'publication_policy',retention_days=(p_settings->>'retention_days')::integer,approval_reference=NULL,approved_at=NULL,approved_by=NULL,updated_by=p_actor,updated_at=now() WHERE school_id=p_school;
 RETURN current_version+1;
END $$;
CREATE FUNCTION public.approve_school_settings(p_school uuid,p_actor uuid,p_version integer,p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE settings public.school_settings;
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 SELECT * INTO settings FROM public.school_settings WHERE school_id=p_school FOR UPDATE;
 IF NOT FOUND OR settings.version IS DISTINCT FROM p_version OR length(settings.privacy_notice)<20 OR length(settings.terms_notice)<20 OR length(settings.age_policy)<10 OR settings.privacy_contact='' OR settings.school_contact='' OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Complete current policies and review reference required' USING ERRCODE='22023'; END IF;
 UPDATE public.school_settings SET approval_reference=btrim(p_reference),approved_at=now(),approved_by=p_actor WHERE school_id=p_school;
END $$;
CREATE FUNCTION public.issue_school_invitation(p_school uuid,p_actor uuid,p_hash text,p_email text,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT public.school_actor_has_role(p_school,p_actor,ARRAY['admin']) THEN RAISE EXCEPTION 'School admin required' USING ERRCODE='42501'; END IF;
 IF p_email IS NULL OR lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'Valid email required' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM public.school_invitations WHERE school_id=p_school AND created_at>now()-interval '1 day')>=100 THEN RAISE EXCEPTION 'Invitation limit reached' USING ERRCODE='54000'; END IF;
 INSERT INTO public.school_invitations(school_id,token_hash,email,role,invited_by,expires_at) VALUES(p_school,p_hash,lower(btrim(p_email)),p_role,p_actor,now()+interval '48 hours');
END $$;
CREATE FUNCTION public.accept_school_invitation(p_actor uuid,p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE invitation public.school_invitations; confirmed_email text;
BEGIN
 SELECT lower(email) INTO confirmed_email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL;
 IF confirmed_email IS NULL THEN RAISE EXCEPTION 'Verified email required' USING ERRCODE='42501'; END IF;
 SELECT * INTO invitation FROM public.school_invitations WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR invitation.accepted_at IS NOT NULL OR invitation.expires_at<=now() OR invitation.email<>confirmed_email THEN RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.schools WHERE id=invitation.school_id FOR UPDATE;
 IF NOT public.school_actor_has_role(invitation.school_id,invitation.invited_by,ARRAY['admin']) THEN RAISE EXCEPTION 'Inviter no longer authorized' USING ERRCODE='42501'; END IF;
 -- A stale lower-privilege invitation cannot demote an existing school member.
 IF EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=invitation.school_id AND user_id=p_actor AND status='active') THEN RAISE EXCEPTION 'Account already belongs to this school' USING ERRCODE='22023'; END IF;
 PERFORM public.change_school_membership(invitation.school_id,invitation.invited_by,p_actor,invitation.role,'active');
 UPDATE public.school_invitations SET accepted_at=now(),accepted_by=p_actor WHERE id=invitation.id;
 RETURN invitation.school_id;
END $$;
REVOKE ALL ON FUNCTION public.apply_to_school(uuid,text,text,text,text),public.review_school_application(uuid,uuid,text,text),public.update_school_settings(uuid,uuid,integer,jsonb),public.approve_school_settings(uuid,uuid,integer,text),public.issue_school_invitation(uuid,uuid,text,text,text),public.accept_school_invitation(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apply_to_school(uuid,text,text,text,text),public.review_school_application(uuid,uuid,text,text),public.update_school_settings(uuid,uuid,integer,jsonb),public.approve_school_settings(uuid,uuid,integer,text),public.issue_school_invitation(uuid,uuid,text,text,text),public.accept_school_invitation(uuid,text) TO service_role;
-- Activation has two independent prerequisites; policy review cannot open the isolation gate.
CREATE OR REPLACE FUNCTION public.guard_school_activation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='active' THEN
  IF NOT EXISTS(SELECT 1 FROM public.school_release_gate WHERE singleton AND isolation_verified) THEN
   RAISE EXCEPTION 'School activation is locked until tenant isolation is verified' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=NEW.id AND approved_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Reviewed school policies are required before activation' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
