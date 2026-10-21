BEGIN;
ALTER TABLE public.school_memberships ADD COLUMN access_state text NOT NULL DEFAULT 'active'
 CHECK(access_state IN('active','suspended','banned','removed'));
-- Existing revocations stay restricted; no previously removed member is restored.
UPDATE public.school_memberships SET access_state='removed' WHERE status='revoked';
ALTER TABLE public.school_memberships ADD CONSTRAINT school_membership_restriction_status
 CHECK(access_state='active' OR status='revoked');

CREATE FUNCTION public.get_school_members(p_school uuid,p_actor uuid,p_search text DEFAULT '',p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.school_memberships m JOIN public.schools s ON s.id=m.school_id WHERE m.school_id=p_school AND m.user_id=p_actor AND m.role='admin' AND m.status='active' AND s.status<>'closed') THEN
  RAISE EXCEPTION 'School admin required' USING ERRCODE='42501';
 END IF;
 IF p_search IS NULL OR length(p_search)>100 OR p_page IS NULL OR p_page<0 OR p_page>10000 THEN
  RAISE EXCEPTION 'Invalid member search' USING ERRCODE='22023';
 END IF;
 SELECT jsonb_build_object('members',coalesce(jsonb_agg(to_jsonb(member)),'[]'::jsonb)) INTO result FROM (
  SELECT m.user_id,p.display_name,p.email,m.role,m.status,m.access_state,m.updated_at
  FROM public.school_memberships m JOIN public.profiles p ON p.id=m.user_id
  WHERE m.school_id=p_school AND (p_search='' OR position(lower(p_search) IN lower(coalesce(p.display_name,'')||' '||coalesce(p.email,'')))>0)
  ORDER BY m.created_at DESC,m.user_id LIMIT 51 OFFSET p_page*50
 ) member;
 RETURN result;
END $$;

CREATE FUNCTION public.manage_school_member(p_school uuid,p_actor uuid,p_user uuid,p_action text,p_expected timestamptz,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE member public.school_memberships; school_status text; next_status text;
BEGIN
 SELECT status INTO school_status FROM public.schools WHERE id=p_school FOR UPDATE;
 IF school_status IS DISTINCT FROM 'active' OR NOT public.school_actor_has_role(p_school,p_actor,ARRAY['admin']) THEN
  RAISE EXCEPTION 'Active school admin required' USING ERRCODE='42501';
 END IF;
 IF p_action IS NULL OR p_action NOT IN('suspended','banned','removed','restore') OR p_reason IS NULL OR length(trim(p_reason))<10 OR length(p_reason)>1000 THEN
  RAISE EXCEPTION 'Action and reason required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO member FROM public.school_memberships WHERE school_id=p_school AND user_id=p_user FOR UPDATE;
 IF NOT FOUND OR member.role NOT IN('student','moderator') OR p_user=p_actor OR public.platform_operator_active(p_user) THEN
  RAISE EXCEPTION 'Only school students and moderators can be managed here' USING ERRCODE='42501';
 END IF;
 IF p_expected IS NULL OR member.updated_at<>p_expected THEN
  RAISE EXCEPTION 'Member changed; reload before confirming' USING ERRCODE='40001';
 END IF;
 IF (p_action='restore' AND member.status<>'revoked') OR (p_action<>'restore' AND member.access_state=p_action) THEN
  RAISE EXCEPTION 'Action no longer available' USING ERRCODE='22023';
 END IF;
 next_status:=CASE WHEN p_action='restore' THEN 'active' ELSE 'revoked' END;
 UPDATE public.school_memberships SET status=next_status,access_state=CASE WHEN p_action='restore' THEN 'active' ELSE p_action END,updated_at=clock_timestamp()
 WHERE school_id=p_school AND user_id=p_user;
 INSERT INTO public.school_registry_events(school_id,actor_id,action,subject_id,detail)
 VALUES(p_school,p_actor,'membership_changed',p_user,jsonb_build_object('action',p_action,'reason',trim(p_reason),'previousStatus',member.status,'previousAccess',member.access_state,'role',member.role,'status',next_status));
END $$;
REVOKE ALL ON FUNCTION public.get_school_members(uuid,uuid,text,integer),public.manage_school_member(uuid,uuid,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT EXECUTE ON FUNCTION public.get_school_members(uuid,uuid,text,integer),public.manage_school_member(uuid,uuid,uuid,text,timestamptz,text) TO service_role;
COMMIT;
