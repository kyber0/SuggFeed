BEGIN;
SET LOCAL lock_timeout='3s';
-- Keep the existing queue and its safety filtering; expose assignment metadata only to the server.
CREATE VIEW public.staff_work_queue WITH(security_invoker=true) AS
 SELECT q.*,w.assignment_team_id,w.assignment_version,t.name AS team_name,
   s.is_urgent AS assignment_urgent,public.assignment_staff_ids(q.school_id,q.id) AS assignment_staff_ids,
   ARRAY(SELECT tm.user_id FROM public.assignment_team_members tm
     JOIN public.assignment_assignees a ON a.school_id=tm.school_id AND a.user_id=tm.user_id AND a.active
     WHERE tm.school_id=q.school_id AND tm.team_id=w.assignment_team_id
       AND public.school_actor_has_role(q.school_id,tm.user_id,ARRAY['admin','moderator'])) AS team_staff_ids
 FROM public.staff_submission_queue q
 JOIN public.submissions s ON s.school_id=q.school_id AND s.id=q.id
 LEFT JOIN public.submission_workflow w ON w.school_id=q.school_id AND w.submission_id=q.id
 LEFT JOIN public.assignment_teams t ON t.school_id=q.school_id AND t.id=w.assignment_team_id;
REVOKE ALL ON public.staff_work_queue FROM PUBLIC,anon,authenticated,tenant_executor,service_role;
GRANT SELECT ON public.staff_work_queue TO service_role;
COMMIT;
