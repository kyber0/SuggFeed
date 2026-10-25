BEGIN;
CREATE OR REPLACE VIEW public.assignment_records AS
 SELECT s.school_id,'suggestion'::text item_kind,s.id item_id,s.category_id,s.title,s.status::text status,s.created_at,
 (s.is_urgent OR coalesce(w.priority,'normal')='urgent') urgent,(s.safety_state<>'clear' OR s.is_urgent) restricted,
 (s.status NOT IN('resolved','rejected') AND s.safety_state<>'deleted') is_open,coalesce(w.priority,'normal') priority,
 w.assignee_id,w.assignment_team_id,w.assigned_at,w.assignment_reason,w.acknowledged_at,w.ack_due_at,w.due_at,coalesce(w.assignment_version,0) assignment_version,
 coalesce(w.escalation_stage,0) escalation_stage,w.next_action_at,w.assignment_sla
 FROM public.submissions s LEFT JOIN public.submission_workflow w ON w.school_id=s.school_id AND w.submission_id=s.id
 UNION ALL SELECT r.school_id,'report',r.id,s.category_id,'Safety report',CASE WHEN r.resolved_at IS NULL THEN 'pending' ELSE 'resolved' END,r.created_at,
 coalesce(s.is_urgent,false),true,r.resolved_at IS NULL,CASE WHEN s.is_urgent THEN 'urgent' ELSE 'normal' END,
 a.assignee_id,a.assignment_team_id,a.assigned_at,a.assignment_reason,a.acknowledged_at,a.ack_due_at,a.due_at,coalesce(a.assignment_version,0),coalesce(a.escalation_stage,0),a.next_action_at,a.assignment_sla
 FROM public.reports r LEFT JOIN public.comments c ON c.school_id=r.school_id AND c.id=r.comment_id
 LEFT JOIN public.submissions s ON s.school_id=r.school_id AND s.id=coalesce(r.submission_id,c.submission_id)
 LEFT JOIN public.report_assignments a ON a.school_id=r.school_id AND a.report_id=r.id;
NOTIFY pgrst,'reload schema';
COMMIT;
