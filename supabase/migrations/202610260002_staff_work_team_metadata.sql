BEGIN;
SET LOCAL lock_timeout='3s';
-- Assignment tables stay private; expose only the metadata needed by the server's scoped board.
CREATE FUNCTION public.staff_work_team_metadata(p_school uuid,p_submission uuid)
 RETURNS TABLE(team_name text,team_staff_ids uuid[]) LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public AS $$
 SELECT t.name,ARRAY(SELECT tm.user_id FROM public.assignment_team_members tm
   JOIN public.assignment_assignees a ON a.school_id=tm.school_id AND a.user_id=tm.user_id AND a.active
   WHERE tm.school_id=p_school AND tm.team_id=w.assignment_team_id
     AND public.school_actor_has_role(p_school,tm.user_id,ARRAY['admin','moderator']))
 FROM public.submission_workflow w LEFT JOIN public.assignment_teams t ON t.school_id=w.school_id AND t.id=w.assignment_team_id
 WHERE w.school_id=p_school AND w.submission_id=p_submission
$$;
REVOKE ALL ON FUNCTION public.staff_work_team_metadata(uuid,uuid) FROM PUBLIC,anon,authenticated,tenant_executor,service_role;
GRANT EXECUTE ON FUNCTION public.staff_work_team_metadata(uuid,uuid) TO service_role;
CREATE OR REPLACE VIEW public.staff_work_queue WITH(security_invoker=true) AS
 SELECT q.*,w.assignment_team_id,w.assignment_version,t.team_name,
   s.is_urgent AS assignment_urgent,public.assignment_staff_ids(q.school_id,q.id) AS assignment_staff_ids,
   coalesce(t.team_staff_ids,'{}'::uuid[]) AS team_staff_ids
 FROM public.staff_submission_queue q
 JOIN public.submissions s ON s.school_id=q.school_id AND s.id=q.id
 LEFT JOIN public.submission_workflow w ON w.school_id=q.school_id AND w.submission_id=q.id
 LEFT JOIN LATERAL public.staff_work_team_metadata(q.school_id,q.id) t ON true;
REVOKE ALL ON public.staff_work_queue FROM PUBLIC,anon,authenticated,tenant_executor,service_role;
GRANT SELECT ON public.staff_work_queue TO service_role;
COMMIT;
