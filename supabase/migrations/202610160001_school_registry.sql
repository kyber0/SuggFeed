-- Staged registry only. Does not scope existing records, grant legacy roles, or enable signup.
-- Activation stays locked until a later, reviewed tenant cutover migration opens the gate.
BEGIN;

CREATE TABLE public.school_release_gate (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 isolation_verified boolean NOT NULL DEFAULT false
);
INSERT INTO public.school_release_gate(singleton) VALUES(true);

CREATE TABLE public.platform_operators (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.schools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 63),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 200),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','active','suspended','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.school_memberships (
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 role text NOT NULL CHECK(role IN('student','moderator','admin')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id,user_id)
);
CREATE INDEX school_memberships_user_idx ON public.school_memberships(user_id,school_id) WHERE status='active';

CREATE TABLE public.school_registry_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN('created','status_changed','membership_changed')),
 subject_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX school_registry_events_school_idx ON public.school_registry_events(school_id,created_at,id);

ALTER TABLE public.school_release_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_registry_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_release_gate,public.platform_operators,public.schools,
 public.school_memberships,public.school_registry_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.schools,public.school_memberships TO authenticated;
GRANT SELECT ON public.schools,public.school_memberships,public.school_registry_events TO service_role;

CREATE FUNCTION public.school_actor_has_role(p_school uuid,p_actor uuid,p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_memberships m JOIN public.schools s ON s.id=m.school_id
 WHERE m.school_id=p_school AND m.user_id=p_actor AND m.status='active' AND s.status='active' AND m.role=ANY(p_roles))
$$;
CREATE FUNCTION public.school_has_role(p_school uuid,p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.school_actor_has_role(p_school,auth.uid(),p_roles)
$$;
CREATE FUNCTION public.school_is_member(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id=auth.uid() AND status='active')
$$;
CREATE FUNCTION public.platform_operator_active(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.platform_operators WHERE user_id=p_actor AND enabled)
$$;

CREATE POLICY "members see their school registry" ON public.schools FOR SELECT TO authenticated
 USING(public.school_is_member(id));
CREATE POLICY "members see self or own school roster" ON public.school_memberships FOR SELECT TO authenticated
 USING((user_id=auth.uid() AND status='active') OR public.school_has_role(school_id,ARRAY['admin']));

CREATE FUNCTION public.guard_school_activation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='active' AND NOT EXISTS(SELECT 1 FROM public.school_release_gate WHERE singleton AND isolation_verified) THEN
  RAISE EXCEPTION 'School activation is locked until tenant isolation is verified' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER school_activation_guard BEFORE INSERT OR UPDATE ON public.schools
 FOR EACH ROW EXECUTE FUNCTION public.guard_school_activation();

-- Server-only entry points. Callers must use the verified session actor, never request-body actor IDs.
CREATE FUNCTION public.create_pending_school(p_actor uuid,p_slug text,p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid;
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_slug) NOT BETWEEN 3 AND 63
 OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 200 THEN
  RAISE EXCEPTION 'Invalid school details' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.schools(slug,name) VALUES(p_slug,btrim(p_name)) RETURNING id INTO result;
 INSERT INTO public.school_registry_events(school_id,actor_id,action) VALUES(result,p_actor,'created');
 RETURN result;
END $$;

CREATE FUNCTION public.change_school_status(p_school uuid,p_actor uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous text;
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 IF p_status IS NULL OR p_status NOT IN('active','suspended','closed') THEN RAISE EXCEPTION 'Invalid school status' USING ERRCODE='22023'; END IF;
 SELECT status INTO previous FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School not found' USING ERRCODE='P0002'; END IF;
 IF previous='closed' THEN RAISE EXCEPTION 'Closed schools cannot be reopened through this operation' USING ERRCODE='22023'; END IF;
 IF previous=p_status THEN RETURN; END IF;
 IF p_status='active' AND NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND role='admin' AND status='active') THEN
  RAISE EXCEPTION 'An active school administrator is required' USING ERRCODE='22023';
 END IF;
 UPDATE public.schools SET status=p_status,updated_at=clock_timestamp() WHERE id=p_school;
 INSERT INTO public.school_registry_events(school_id,actor_id,action,detail)
 VALUES(p_school,p_actor,'status_changed',jsonb_build_object('previous',previous,'status',p_status));
END $$;

CREATE FUNCTION public.change_school_membership(p_school uuid,p_actor uuid,p_user uuid,p_role text,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE school_status text; previous public.school_memberships;
BEGIN
 IF p_role IS NULL OR p_role NOT IN('student','moderator','admin') OR p_status IS NULL OR p_status NOT IN('active','revoked') OR p_user IS NULL THEN
  RAISE EXCEPTION 'Invalid membership' USING ERRCODE='22023';
 END IF;
 -- Serialize all membership changes for a school, including concurrent last-admin removals.
 SELECT status INTO school_status FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School not found' USING ERRCODE='P0002'; END IF;
 IF NOT public.platform_operator_active(p_actor) AND NOT public.school_actor_has_role(p_school,p_actor,ARRAY['admin']) THEN
  RAISE EXCEPTION 'School admin required' USING ERRCODE='42501';
 END IF;
 IF school_status='closed' THEN RAISE EXCEPTION 'School is closed' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM public.school_memberships WHERE school_id=p_school AND user_id=p_user;
 IF previous.role='admin' AND previous.status='active' AND (p_role<>'admin' OR p_status<>'active')
 AND NOT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=p_school AND user_id<>p_user AND role='admin' AND status='active') THEN
  RAISE EXCEPTION 'Cannot remove the last active administrator' USING ERRCODE='22023';
 END IF;
 IF previous.role=p_role AND previous.status=p_status THEN RETURN; END IF;
 INSERT INTO public.school_memberships(school_id,user_id,role,status) VALUES(p_school,p_user,p_role,p_status)
 ON CONFLICT(school_id,user_id) DO UPDATE SET role=excluded.role,status=excluded.status,updated_at=clock_timestamp();
 INSERT INTO public.school_registry_events(school_id,actor_id,action,subject_id,detail)
 VALUES(p_school,p_actor,'membership_changed',p_user,jsonb_build_object('previousRole',previous.role,'previousStatus',previous.status,'role',p_role,'status',p_status));
END $$;

REVOKE ALL ON FUNCTION public.school_actor_has_role(uuid,uuid,text[]),public.school_has_role(uuid,text[]),
 public.school_is_member(uuid),public.platform_operator_active(uuid),public.guard_school_activation(),
 public.create_pending_school(uuid,text,text),public.change_school_status(uuid,uuid,text),
 public.change_school_membership(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.school_has_role(uuid,text[]),public.school_is_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_actor_has_role(uuid,uuid,text[]),public.platform_operator_active(uuid),
 public.create_pending_school(uuid,text,text),public.change_school_status(uuid,uuid,text),
 public.change_school_membership(uuid,uuid,uuid,text,text) TO service_role;
COMMIT;
