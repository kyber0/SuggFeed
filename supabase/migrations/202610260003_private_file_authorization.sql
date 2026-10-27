BEGIN;
GRANT CREATE ON SCHEMA public TO tenant_executor;
-- Private reads must use the same assignment decision as staff workflow writes.
GRANT EXECUTE ON FUNCTION public.assignment_can_access(uuid,uuid,text,uuid) TO service_role;
DO $$ DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('public.assignment_rpc_readable(uuid,uuid)'::regprocedure) INTO definition;
 IF position('''read_staff_idea_update_files'',''moderate_submission''' in definition)=0 THEN
  RAISE EXCEPTION 'Unexpected assignment guard definition';
 END IF;
 definition:=replace(definition,'''read_staff_idea_update_files'',''moderate_submission''','''read_staff_idea_update_files'',''read_authorized_progress_file'',''moderate_submission''');
 EXECUTE definition;
END $$;

-- Public audience is resolved independently before using any privileged actor.
CREATE FUNCTION public.read_public_progress_file(p_file_id uuid)
RETURNS SETOF public.idea_update_uploads LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT f.* FROM public.idea_update_uploads f
 JOIN public.idea_updates u ON u.school_id=f.school_id AND u.id=f.update_id
 JOIN public.submissions s ON s.school_id=u.school_id AND s.id=u.submission_id
 WHERE f.id=p_file_id AND f.state='published' AND u.deleted_at IS NULL
 AND u.visibility='public' AND s.status::text IN('approved','in_progress','resolved')
 AND s.safety_state='clear' AND NOT s.is_urgent
$$;
ALTER FUNCTION public.read_public_progress_file(uuid) OWNER TO tenant_executor;
REVOKE ALL ON FUNCTION public.read_public_progress_file(uuid) FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO public.tenant_rpc_catalog(function_signature,function_name,allow_anonymous)
VALUES('public.read_public_progress_file(uuid)','read_public_progress_file',true);

REVOKE CREATE ON SCHEMA public FROM tenant_executor;
NOTIFY pgrst,'reload schema';
COMMIT;
