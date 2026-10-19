-- Versioned school presentation. Defaults retain existing school behavior.
BEGIN;
ALTER TABLE public.categories ADD COLUMN description text NOT NULL DEFAULT '' CHECK(length(description)<=200), ADD COLUMN icon text NOT NULL DEFAULT 'message', ADD COLUMN display_order integer NOT NULL DEFAULT 0;
CREATE TABLE public.school_customization_state (
 school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE RESTRICT,
 editing_enabled boolean NOT NULL DEFAULT false,
 draft jsonb, revision integer NOT NULL DEFAULT 0, published_version integer,
 updated_by uuid REFERENCES public.profiles(id), updated_at timestamptz NOT NULL DEFAULT now(),
 review_requested_at timestamptz, form_review_hash text, form_policy_version integer,
 form_reviewed_by uuid REFERENCES public.profiles(id), form_review_reference text, restored_from integer
);
CREATE TABLE public.school_form_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 schema jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(school_id,id)
);
CREATE TABLE public.school_customization_versions (
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT, version integer NOT NULL CHECK(version>0),
 configuration jsonb NOT NULL,form_version_id uuid,changed_by uuid NOT NULL REFERENCES public.profiles(id),
 restored_from integer,change_summary jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(school_id,version),
 FOREIGN KEY(school_id,form_version_id) REFERENCES public.school_form_versions(school_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.school_customization_state ADD FOREIGN KEY(school_id,published_version) REFERENCES public.school_customization_versions(school_id,version) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.school_brand_assets (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN('logo','cover')),storage_path text NOT NULL UNIQUE,
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),width integer NOT NULL CHECK(width BETWEEN 1 AND 2400),height integer NOT NULL CHECK(height BETWEEN 1 AND 2400),
 created_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(school_id,id),
 CHECK(storage_path=school_id::text||'/'||id::text||'.webp')
);
ALTER TABLE public.school_customization_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_customization_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_form_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_brand_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_customization_state,public.school_customization_versions,public.school_form_versions,public.school_brand_assets FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT SELECT ON public.school_customization_state,public.school_customization_versions,public.school_form_versions,public.school_brand_assets TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('school-branding','school-branding',false,5242880,ARRAY['image/webp']) ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.school_registry_events DROP CONSTRAINT school_registry_events_action_check;
ALTER TABLE public.school_registry_events ADD CONSTRAINT school_registry_events_action_check CHECK(action IN('created','status_changed','membership_changed','domain_requested','domain_verified','domain_enabled','domain_disabled','domain_removed','enrollment_changed','customization_saved','customization_published','customization_restored','customization_rollout','customization_reviewed'));

CREATE FUNCTION public.school_customization_defaults(p_school uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('schemaVersion',1,'displayName','','palette','navy','logo',NULL,'cover',NULL,
 'welcome',jsonb_build_object('headline','','intro','','message','','help','','links','[]'::jsonb),
 'categories',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug,'description',description,'icon',icon,'active',is_active) ORDER BY display_order,name),'[]'::jsonb) FROM public.categories WHERE school_id=p_school),
 'features',jsonb_build_object('comments',true,'voting',true,'roadmap',true,'sharing',true,'anonymous',true),
 'form',jsonb_build_object('instructions','','example','','questions','[]'::jsonb,'attachments','off'),
 'labels',jsonb_build_object('approved','Planned','in_progress','In progress','resolved','Completed'),
 'stageDescriptions',jsonb_build_object('approved','Approved ideas ready for the next step.','in_progress','Follow work underway in your school.','resolved','Community feedback put into action.'),
 'email',jsonb_build_object('invitation','','introduction','','digest','weekly'),'formVersion',NULL)
$$;
CREATE FUNCTION public.school_published_configuration(p_school uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce((SELECT v.configuration FROM public.school_customization_state s JOIN public.school_customization_versions v ON v.school_id=s.school_id AND v.version=s.published_version WHERE s.school_id=p_school),public.school_customization_defaults(p_school))
$$;
CREATE FUNCTION public.school_presentation(p_slug text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT to_jsonb(s)||jsonb_build_object('configuration',public.school_published_configuration(s.id),'customization_version',coalesce((SELECT published_version FROM public.school_customization_state WHERE school_id=s.id),0)) FROM public.schools s WHERE s.slug=p_slug
$$;
CREATE FUNCTION public.school_customization_admin(p_school uuid,p_actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_memberships m JOIN public.schools s ON s.id=m.school_id WHERE s.id=p_school AND s.status<>'closed' AND m.user_id=p_actor AND m.role='admin' AND m.status='active')
$$;
CREATE FUNCTION public.school_feature_enabled(p_school uuid,p_feature text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT p_feature IN('comments','voting','roadmap','sharing','anonymous') AND coalesce((public.school_published_configuration(p_school)->'features'->>p_feature)::boolean,false)
$$;
CREATE FUNCTION public.validate_school_customization(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c jsonb;q jsonb;k text;allowed text[];n integer;section record;field record;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR octet_length(p::text)>80000 OR p->>'schemaVersion'<>'1' OR p->>'palette' NOT IN('navy','forest','purple','burgundy','teal','indigo') THEN RAISE EXCEPTION 'Invalid customization' USING ERRCODE='22023'; END IF;

 IF NOT p ?& ARRAY['schemaVersion','displayName','palette','logo','cover','welcome','categories','features','form','labels','stageDescriptions','email'] OR p->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'palette') IS DISTINCT FROM 'string' OR p->>'palette' NOT IN('navy','forest','purple','burgundy','teal','indigo') THEN RAISE EXCEPTION 'Missing customization fields' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['logo','cover'] LOOP IF p->k<>'null'::jsonb AND (jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR (p->>k)::uuid IS NULL) THEN RAISE EXCEPTION 'Invalid branding reference' USING ERRCODE='22023'; END IF; END LOOP;
 FOR section IN SELECT * FROM (VALUES('welcome',ARRAY['headline','intro','message','help','links']),('features',ARRAY['comments','voting','roadmap','sharing','anonymous']),('form',ARRAY['instructions','example','questions','attachments']),('labels',ARRAY['approved','in_progress','resolved']),('stageDescriptions',ARRAY['approved','in_progress','resolved']),('email',ARRAY['invitation','introduction','digest'])) x(name,keys) LOOP
  c:=p->section.name;
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid customization section' USING ERRCODE='22023'; END IF;
  IF NOT c ?& section.keys OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) key WHERE NOT key=ANY(section.keys)) THEN RAISE EXCEPTION 'Missing or unsupported section fields' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR field IN SELECT * FROM (VALUES(p->'displayName',0,60),(p->'welcome'->'headline',0,100),(p->'welcome'->'intro',0,500),(p->'welcome'->'message',0,1500),(p->'welcome'->'help',0,500),(p->'form'->'instructions',0,1000),(p->'form'->'example',0,1000),(p->'labels'->'approved',1,40),(p->'labels'->'in_progress',1,40),(p->'labels'->'resolved',1,40),(p->'stageDescriptions'->'approved',0,240),(p->'stageDescriptions'->'in_progress',0,240),(p->'stageDescriptions'->'resolved',0,240),(p->'email'->'invitation',0,1000),(p->'email'->'introduction',0,1000),(p->'form'->'attachments',1,8),(p->'email'->'digest',1,6)) x(value,minlen,maxlen) LOOP
  IF jsonb_typeof(field.value) IS DISTINCT FROM 'string' OR length(btrim(field.value#>>'{}')) NOT BETWEEN field.minlen AND field.maxlen THEN RAISE EXCEPTION 'Invalid customization text' USING ERRCODE='22023'; END IF;
 END LOOP;
 allowed:=ARRAY['schemaVersion','displayName','palette','logo','cover','welcome','categories','features','form','labels','stageDescriptions','email'];
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) x WHERE NOT x=ANY(allowed)) OR length(p->>'displayName')>60 THEN RAISE EXCEPTION 'Unsupported customization fields' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p->'welcome')<>'object' OR jsonb_typeof(p->'features')<>'object' OR jsonb_typeof(p->'form')<>'object' OR jsonb_typeof(p->'labels')<>'object' OR jsonb_typeof(p->'email')<>'object' OR jsonb_typeof(p->'categories')<>'array' OR jsonb_array_length(p->'categories') NOT BETWEEN 1 AND 60 OR jsonb_typeof(p->'form'->'questions')<>'array' OR jsonb_array_length(p->'form'->'questions')>8 OR jsonb_typeof(p->'welcome'->'links')<>'array' OR jsonb_array_length(p->'welcome'->'links')>5 THEN RAISE EXCEPTION 'Invalid customization sections' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['comments','voting','roadmap','sharing','anonymous'] LOOP IF jsonb_typeof(p->'features'->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid feature flag' USING ERRCODE='22023'; END IF; END LOOP;
 IF p->'form'->>'attachments' NOT IN('off','optional','required') OR p->'email'->>'digest' NOT IN('weekly','off') THEN RAISE EXCEPTION 'Unsupported form or email setting' USING ERRCODE='22023'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p->'categories') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid category' USING ERRCODE='22023'; END IF;
  IF NOT c ?& ARRAY['id','name','slug','description','icon','active'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) key WHERE key<>ALL(ARRAY['id','name','slug','description','icon','active'])) THEN RAISE EXCEPTION 'Invalid category fields' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['id','name','slug','description','icon'] LOOP IF jsonb_typeof(c->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid category text' USING ERRCODE='22023'; END IF; END LOOP;
  IF (c->>'id')::uuid IS NULL OR length(btrim(c->>'name')) NOT BETWEEN 1 AND 40 OR length(c->>'description')>200 OR c->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(c->>'slug')>63 OR c->>'icon' NOT IN('board','message','care','users','shield','list','calendar','book','building','globe') OR jsonb_typeof(c->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid category' USING ERRCODE='22023'; END IF;
 END LOOP;
 SELECT count(*) INTO n FROM jsonb_array_elements(p->'categories') item WHERE (item->>'active')::boolean;
 IF n NOT BETWEEN 1 AND 20 OR (SELECT count(DISTINCT lower(value->>'name')) FROM jsonb_array_elements(p->'categories'))<>jsonb_array_length(p->'categories') OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p->'categories'))<>jsonb_array_length(p->'categories') OR (SELECT count(DISTINCT value->>'slug') FROM jsonb_array_elements(p->'categories'))<>jsonb_array_length(p->'categories') THEN RAISE EXCEPTION 'Use unique categories and 1-20 active categories' USING ERRCODE='22023'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(p->'form'->'questions') LOOP
  IF jsonb_typeof(q) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid question' USING ERRCODE='22023'; END IF;
  IF NOT q ?& ARRAY['id','label','help','type','required','options'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(q) key WHERE key<>ALL(ARRAY['id','label','help','type','required','options'])) THEN RAISE EXCEPTION 'Invalid question fields' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['id','label','help','type'] LOOP IF jsonb_typeof(q->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid question text' USING ERRCODE='22023'; END IF; END LOOP;
  IF jsonb_typeof(q->'options') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid choices' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(q->'options') o WHERE jsonb_typeof(o) IS DISTINCT FROM 'string' OR length(btrim(o#>>'{}')) NOT BETWEEN 1 AND 80) OR (SELECT count(DISTINCT o) FROM jsonb_array_elements(q->'options') o)<>jsonb_array_length(q->'options') THEN RAISE EXCEPTION 'Invalid or duplicate choices' USING ERRCODE='22023'; END IF;
  IF (q->>'id')::uuid IS NULL OR length(btrim(q->>'label')) NOT BETWEEN 1 AND 120 OR length(q->>'help')>240 OR q->>'type' NOT IN('short','long','choice') OR jsonb_typeof(q->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(q->'options')<>'array' OR (q->>'type'='choice' AND jsonb_array_length(q->'options') NOT BETWEEN 2 AND 10) OR (q->>'type'<>'choice' AND jsonb_array_length(q->'options')<>0) THEN RAISE EXCEPTION 'Invalid question' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p->'form'->'questions'))<>jsonb_array_length(p->'form'->'questions') THEN RAISE EXCEPTION 'Duplicate question IDs' USING ERRCODE='22023'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p->'welcome'->'links') LOOP
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid official link' USING ERRCODE='22023'; END IF;
 IF NOT c ?& ARRAY['label','url'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) key WHERE key<>ALL(ARRAY['label','url'])) OR jsonb_typeof(c->'url') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'label') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid official link fields' USING ERRCODE='22023'; END IF;
 IF c->>'url' !~ '^https://[^/@[:space:]?#]+([/?#]|$)' OR length(c->>'url')>500 OR length(btrim(c->>'label')) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Invalid official link' USING ERRCODE='22023'; END IF; END LOOP;
END $$;
CREATE FUNCTION public.get_school_customization(p_school uuid,p_actor uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.school_customization_state;
BEGIN
 IF NOT public.school_customization_admin(p_school,p_actor) THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.school_customization_state WHERE school_id=p_school;
 RETURN jsonb_build_object('draft',coalesce(s.draft,public.school_published_configuration(p_school)),'revision',coalesce(s.revision,0),'published',public.school_published_configuration(p_school),'published_version',coalesce(s.published_version,0),'editing_enabled',coalesce(s.editing_enabled,p_school='00000000-0000-4000-8000-000000000001'::uuid),'saved_at',s.updated_at,'saved_by',s.updated_by,'saved_by_name',(SELECT display_name FROM public.profiles WHERE id=s.updated_by),'review_requested_at',s.review_requested_at,'form_review_hash',s.form_review_hash,'form_policy_version',s.form_policy_version,
 'history',(SELECT coalesce(jsonb_agg(x ORDER BY x.version DESC),'[]'::jsonb) FROM (SELECT v.version,v.changed_by,v.restored_from,v.created_at,v.change_summary,(SELECT display_name FROM public.profiles WHERE id=v.changed_by) actor_name FROM public.school_customization_versions v WHERE v.school_id=p_school ORDER BY v.version DESC LIMIT 30)x));
END $$;
CREATE FUNCTION public.save_school_customization(p_school uuid,p_actor uuid,p_revision integer,p_configuration jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.school_customization_state;
BEGIN
 PERFORM 1 FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT public.school_customization_admin(p_school,p_actor) THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.school_customization_state WHERE school_id=p_school FOR UPDATE;
 IF NOT coalesce(s.editing_enabled,p_school='00000000-0000-4000-8000-000000000001'::uuid) THEN RAISE EXCEPTION 'Editor not enabled for this school' USING ERRCODE='42501'; END IF;
 IF p_revision IS DISTINCT FROM coalesce(s.revision,0) THEN RAISE EXCEPTION 'Draft changed; reload before saving' USING ERRCODE='40001'; END IF;
 PERFORM public.validate_school_customization(p_configuration);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_configuration->'categories') item JOIN public.categories existing ON existing.id=(item->>'id')::uuid WHERE existing.school_id<>p_school) THEN RAISE EXCEPTION 'Category belongs to another school' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES(p_configuration->>'logo','logo'),(p_configuration->>'cover','cover')) f(id,kind) WHERE f.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.school_brand_assets WHERE school_id=p_school AND id=f.id::uuid AND kind=f.kind)) THEN RAISE EXCEPTION 'Branding asset unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.school_customization_state(school_id,draft,revision,updated_by,editing_enabled) VALUES(p_school,p_configuration,1,p_actor,p_school='00000000-0000-4000-8000-000000000001'::uuid)
 ON CONFLICT(school_id) DO UPDATE SET draft=excluded.draft,revision=school_customization_state.revision+1,updated_by=p_actor,updated_at=now(),review_requested_at=NULL,restored_from=NULL;
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail) VALUES(p_school,p_actor,'customization_saved',jsonb_build_object('revision',coalesce(s.revision,0)+1));
 RETURN coalesce(s.revision,0)+1;
END $$;
CREATE FUNCTION public.publish_school_customization(p_school uuid,p_actor uuid,p_revision integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.school_customization_state;p jsonb;c jsonb;v integer;form_id uuid;old_form jsonb;policy_version integer;needs_review boolean;summary jsonb;previous jsonb;
BEGIN
 PERFORM 1 FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT public.school_customization_admin(p_school,p_actor) THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.school_customization_state WHERE school_id=p_school FOR UPDATE;
 IF NOT FOUND OR NOT s.editing_enabled OR s.draft IS NULL OR s.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Reload the current enabled draft' USING ERRCODE='40001'; END IF;
 p:=s.draft;PERFORM public.validate_school_customization(p);
 IF EXISTS(SELECT 1 FROM (VALUES(p->>'logo','logo'),(p->>'cover','cover')) f(id,kind) WHERE f.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.school_brand_assets WHERE school_id=p_school AND id=f.id::uuid AND kind=f.kind)) THEN RAISE EXCEPTION 'Branding asset unavailable' USING ERRCODE='42501'; END IF;
 previous:=public.school_published_configuration(p_school);old_form:=previous->'form';
 SELECT coalesce(jsonb_agg(label),'[]') INTO summary FROM (VALUES('School display name',previous->'displayName',p->'displayName'),('Accent palette',previous->'palette',p->'palette'),('School logo',previous->'logo',p->'logo'),('Cover image',previous->'cover',p->'cover'),('Welcome content and links',previous->'welcome',p->'welcome'),('Categories and availability',previous->'categories',p->'categories'),('Submission form',previous->'form',p->'form'),('Community features',previous->'features',p->'features'),('Public progress labels',previous->'labels',p->'labels'),('Public stage explanations',previous->'stageDescriptions',p->'stageDescriptions'),('Email and digests',previous->'email',p->'email')) changes(label,old_value,new_value) WHERE old_value IS DISTINCT FROM new_value;
 SELECT version INTO policy_version FROM public.school_settings WHERE school_id=p_school AND approved_at IS NOT NULL;
 needs_review:=(p->'form') IS DISTINCT FROM old_form AND (jsonb_array_length(p->'form'->'questions')>0 OR p->'form'->>'attachments'<>'off');
 IF needs_review AND (s.form_review_hash IS DISTINCT FROM md5((p->'form')::text) OR s.form_policy_version IS DISTINCT FROM policy_version OR policy_version IS NULL) THEN RAISE EXCEPTION 'Form review and approved school policy required' USING ERRCODE='P0203'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'categories') item JOIN public.categories existing ON existing.id=(item->>'id')::uuid WHERE existing.school_id<>p_school) THEN RAISE EXCEPTION 'Category belongs to another school' USING ERRCODE='42501'; END IF;
 UPDATE public.student_saved_searches searches SET filters=jsonb_set(searches.filters,'{category}',to_jsonb(category.id::text)) FROM public.categories category WHERE searches.school_id=p_school AND category.school_id=p_school AND searches.filters->>'category' IN(category.name,category.slug);
 -- Retain unmentioned categories for existing submissions, archived for future writes.
 UPDATE public.categories SET is_active=false WHERE school_id=p_school;
 FOR c IN SELECT value FROM jsonb_array_elements(p->'categories') WITH ORDINALITY item(value,ord) ORDER BY ord LOOP
  INSERT INTO public.categories(id,school_id,name,slug,is_active,description,icon,display_order) VALUES((c->>'id')::uuid,p_school,c->>'name',c->>'slug',(c->>'active')::boolean,c->>'description',c->>'icon',(SELECT ord::integer FROM jsonb_array_elements(p->'categories') WITH ORDINALITY x(value,ord) WHERE value->>'id'=c->>'id'))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,is_active=excluded.is_active,description=excluded.description,icon=excluded.icon,display_order=excluded.display_order;
 END LOOP;
 SELECT id INTO form_id FROM public.school_form_versions WHERE school_id=p_school AND schema=p->'form' ORDER BY created_at DESC LIMIT 1;
 IF form_id IS NULL THEN INSERT INTO public.school_form_versions(school_id,schema) VALUES(p_school,p->'form') RETURNING id INTO form_id; END IF;
 v:=coalesce(s.published_version,0)+1;
 INSERT INTO public.school_customization_versions(school_id,version,configuration,form_version_id,changed_by,restored_from,change_summary) VALUES(p_school,v,p||jsonb_build_object('formVersion',form_id),form_id,p_actor,s.restored_from,summary);
 UPDATE public.school_customization_state SET published_version=v,revision=revision+1,review_requested_at=NULL WHERE school_id=p_school;
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail) VALUES(p_school,p_actor,'customization_published',jsonb_build_object('version',v,'revision',p_revision));
 RETURN v;
END $$;
CREATE FUNCTION public.restore_school_customization(p_school uuid,p_actor uuid,p_revision integer,p_version integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE configuration jsonb;r integer;
BEGIN
 IF NOT public.school_customization_admin(p_school,p_actor) THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 SELECT v.configuration-'formVersion' INTO configuration FROM public.school_customization_versions v WHERE school_id=p_school AND version=p_version;
 IF configuration IS NULL THEN RAISE EXCEPTION 'Version unavailable' USING ERRCODE='P0002'; END IF;
 configuration:=jsonb_set(configuration,'{categories}',(configuration->'categories')||coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug,'description',description,'icon',icon,'active',false) ORDER BY display_order,name) FROM public.categories c WHERE c.school_id=p_school AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(configuration->'categories') item WHERE (item->>'id')::uuid=c.id)),'[]'::jsonb));
 r:=public.save_school_customization(p_school,p_actor,p_revision,configuration);
 UPDATE public.school_customization_state SET restored_from=p_version WHERE school_id=p_school;
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail) VALUES(p_school,p_actor,'customization_restored',jsonb_build_object('from_version',p_version,'revision',r));RETURN r;
END $$;
CREATE FUNCTION public.set_school_customization_rollout(p_school uuid,p_actor uuid,p_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.school_customization_state(school_id,editing_enabled) VALUES(p_school,p_enabled) ON CONFLICT(school_id) DO UPDATE SET editing_enabled=p_enabled;
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail) VALUES(p_school,p_actor,'customization_rollout',jsonb_build_object('enabled',p_enabled));
END $$;
CREATE FUNCTION public.request_school_form_review(p_school uuid,p_actor uuid,p_revision integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.school_customization_admin(p_school,p_actor) THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501'; END IF;
 UPDATE public.school_customization_state SET review_requested_at=now() WHERE school_id=p_school AND revision=p_revision AND draft IS NOT NULL AND editing_enabled;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reload the current draft' USING ERRCODE='40001'; END IF;
END $$;
CREATE FUNCTION public.review_school_customization_form(p_school uuid,p_actor uuid,p_revision integer,p_reference text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE policy_version integer;
BEGIN
 IF NOT public.platform_operator_active(p_actor) OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Platform reviewer and reference required' USING ERRCODE='42501'; END IF;
 SELECT version INTO policy_version FROM public.school_settings WHERE school_id=p_school AND approved_at IS NOT NULL;
 IF policy_version IS NULL THEN RAISE EXCEPTION 'Reviewed school policy required' USING ERRCODE='42501'; END IF;
 UPDATE public.school_customization_state SET form_review_hash=md5((draft->'form')::text),form_policy_version=policy_version,form_reviewed_by=p_actor,form_review_reference=btrim(p_reference),review_requested_at=NULL WHERE school_id=p_school AND revision=p_revision AND review_requested_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Requested form draft changed' USING ERRCODE='40001'; END IF;
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail) VALUES(p_school,p_actor,'customization_reviewed',jsonb_build_object('revision',p_revision,'policy_version',policy_version));
END $$;
CREATE FUNCTION public.register_school_brand_asset(p_school uuid,p_actor uuid,p_id uuid,p_kind text,p_size integer,p_width integer,p_height integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.school_customization_admin(p_school,p_actor) OR NOT coalesce((SELECT editing_enabled FROM public.school_customization_state WHERE school_id=p_school),p_school='00000000-0000-4000-8000-000000000001'::uuid) THEN RAISE EXCEPTION 'Enabled school administrator required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.school_brand_assets(id,school_id,kind,storage_path,size_bytes,width,height,created_by) VALUES(p_id,p_school,p_kind,p_school::text||'/'||p_id::text||'.webp',p_size,p_width,p_height,p_actor);
END $$;
CREATE FUNCTION public.school_feature_write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE feature text;
BEGIN
 feature:=CASE TG_TABLE_NAME WHEN 'votes' THEN 'voting' WHEN 'comments' THEN 'comments' WHEN 'shared_posts' THEN 'sharing' WHEN 'submissions' THEN CASE WHEN NEW.user_id IS NULL THEN 'anonymous' ELSE NULL END END;
 IF feature IS NOT NULL AND NOT public.school_feature_enabled(NEW.school_id,feature) THEN RAISE EXCEPTION 'This school disabled this feature' USING ERRCODE='P0201'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER school_vote_feature BEFORE INSERT ON public.votes FOR EACH ROW EXECUTE FUNCTION public.school_feature_write_guard();
CREATE TRIGGER school_comment_feature BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.school_feature_write_guard();
CREATE TRIGGER school_share_feature BEFORE INSERT ON public.shared_posts FOR EACH ROW EXECUTE FUNCTION public.school_feature_write_guard();
CREATE TRIGGER school_anonymous_feature BEFORE INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.school_feature_write_guard();
DO $$ DECLARE f record;BEGIN FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('school_customization_defaults','school_published_configuration','school_presentation','school_customization_admin','school_feature_enabled','validate_school_customization','get_school_customization','save_school_customization','publish_school_customization','restore_school_customization','set_school_customization_rollout','request_school_form_review','review_school_customization_form','register_school_brand_asset','school_feature_write_guard') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role,tenant_executor',f.oid::regprocedure);
 IF f.oid<>'public.school_feature_write_guard()'::regprocedure AND f.oid<>'public.validate_school_customization(jsonb)'::regprocedure THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.oid::regprocedure);END IF;
 END LOOP;END $$;
INSERT INTO public.school_customization_state(school_id,editing_enabled) SELECT id,true FROM public.schools WHERE id='00000000-0000-4000-8000-000000000001';
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
