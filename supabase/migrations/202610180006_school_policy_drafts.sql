-- Keep approved notices live until a replacement is reviewed and published.
BEGIN;
CREATE TABLE public.school_policy_drafts (
 school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE RESTRICT,version integer NOT NULL,
 settings jsonb NOT NULL,updated_by uuid NOT NULL REFERENCES public.profiles(id),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.school_policy_publications (
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,version integer NOT NULL,
 snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(school_id,version)
);
ALTER TABLE public.school_policy_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_policy_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_policy_drafts,public.school_policy_publications FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT SELECT ON public.school_policy_drafts,public.school_policy_publications TO service_role;
INSERT INTO public.school_policy_publications(school_id,version,snapshot) SELECT school_id,version,to_jsonb(s) FROM public.school_settings s WHERE approved_at IS NOT NULL;
CREATE OR REPLACE FUNCTION public.update_school_settings(p_school uuid,p_actor uuid,p_version integer,p_settings jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE live public.school_settings;draft public.school_policy_drafts;expected integer;next_version integer;field text;
BEGIN
 PERFORM 1 FROM public.schools WHERE id=p_school AND status<>'closed' FOR UPDATE;
 IF NOT FOUND OR NOT public.school_customization_admin(p_school,p_actor) THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 SELECT * INTO live FROM public.school_settings WHERE school_id=p_school FOR UPDATE;
 SELECT * INTO draft FROM public.school_policy_drafts WHERE school_id=p_school FOR UPDATE;
 expected:=coalesce(draft.version,live.version,1);
 IF p_version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Policy draft changed; reload' USING ERRCODE='40001'; END IF;
 IF p_settings IS NULL OR jsonb_typeof(p_settings)<>'object' OR NOT(p_settings ?& ARRAY['privacy_notice','terms_notice','age_policy','privacy_contact','school_contact','publication_policy','retention_days']) OR p_settings-ARRAY['privacy_notice','terms_notice','age_policy','privacy_contact','school_contact','publication_policy','retention_days']<>'{}'::jsonb OR length(btrim(p_settings->>'privacy_notice')) NOT BETWEEN 20 AND 20000 OR length(btrim(p_settings->>'terms_notice')) NOT BETWEEN 20 AND 20000 OR length(btrim(p_settings->>'age_policy')) NOT BETWEEN 10 AND 4000 OR length(p_settings->>'privacy_contact')>254 OR length(p_settings->>'school_contact')>254 OR p_settings->>'privacy_contact' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR p_settings->>'school_contact' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR p_settings->>'publication_policy' NOT IN('private','public') OR (p_settings->>'retention_days')::integer NOT BETWEEN 1 AND 3650 THEN RAISE EXCEPTION 'Complete valid school notices, contacts and retention required' USING ERRCODE='22023'; END IF;
 FOREACH field IN ARRAY ARRAY['privacy_notice','terms_notice','age_policy','privacy_contact','school_contact','publication_policy'] LOOP IF jsonb_typeof(p_settings->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Policy values must be text' USING ERRCODE='22023'; END IF;END LOOP;
 IF jsonb_typeof(p_settings->'retention_days') IS DISTINCT FROM 'number' OR (p_settings->>'retention_days') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Retention must be a whole number of days' USING ERRCODE='22023'; END IF;
 next_version:=expected+1;
 INSERT INTO public.school_policy_drafts(school_id,version,settings,updated_by) VALUES(p_school,next_version,p_settings,p_actor) ON CONFLICT(school_id) DO UPDATE SET version=excluded.version,settings=excluded.settings,updated_by=excluded.updated_by,updated_at=now();
 INSERT INTO public.school_settings_versions(school_id,version,snapshot,changed_by) VALUES(p_school,next_version,p_settings||jsonb_build_object('version',next_version,'approved_at',NULL),p_actor) ON CONFLICT DO NOTHING;
 IF live.school_id IS NULL THEN
  INSERT INTO public.school_settings(school_id,version,privacy_notice,terms_notice,age_policy,privacy_contact,school_contact,publication_policy,retention_days,updated_by)
  VALUES(p_school,next_version,p_settings->>'privacy_notice',p_settings->>'terms_notice',p_settings->>'age_policy',p_settings->>'privacy_contact',p_settings->>'school_contact',p_settings->>'publication_policy',(p_settings->>'retention_days')::integer,p_actor);
 END IF;
 RETURN next_version;
END $$;
CREATE OR REPLACE FUNCTION public.approve_school_settings(p_school uuid,p_actor uuid,p_version integer,p_reference text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d public.school_policy_drafts;live public.school_settings;p jsonb;
BEGIN
 IF NOT public.platform_operator_active(p_actor) OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Platform reviewer and reference required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.schools WHERE id=p_school FOR UPDATE;
 SELECT * INTO live FROM public.school_settings WHERE school_id=p_school FOR UPDATE;
 SELECT * INTO d FROM public.school_policy_drafts WHERE school_id=p_school FOR UPDATE;
 IF d.school_id IS NULL THEN
  IF live.school_id IS NULL OR live.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Policy changed; reload' USING ERRCODE='40001'; END IF;
  p:=to_jsonb(live);
 ELSE
  IF d.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Policy draft changed; reload' USING ERRCODE='40001'; END IF;p:=d.settings;
 END IF;
 IF length(coalesce(p->>'privacy_notice',''))<20 OR length(coalesce(p->>'terms_notice',''))<20 OR length(coalesce(p->>'age_policy',''))<10 OR coalesce(p->>'privacy_contact','')='' OR coalesce(p->>'school_contact','')='' THEN RAISE EXCEPTION 'Complete policy required' USING ERRCODE='22023'; END IF;
 UPDATE public.school_settings SET version=p_version,privacy_notice=p->>'privacy_notice',terms_notice=p->>'terms_notice',age_policy=p->>'age_policy',privacy_contact=p->>'privacy_contact',school_contact=p->>'school_contact',publication_policy=p->>'publication_policy',retention_days=(p->>'retention_days')::integer,approved_at=now(),approved_by=p_actor,approval_reference=btrim(p_reference),updated_by=coalesce(d.updated_by,live.updated_by),updated_at=now() WHERE school_id=p_school;
 INSERT INTO public.school_policy_publications(school_id,version,snapshot) SELECT school_id,version,to_jsonb(s) FROM public.school_settings s WHERE school_id=p_school ON CONFLICT DO NOTHING;
 DELETE FROM public.school_policy_drafts WHERE school_id=p_school;
END $$;
COMMIT;
