BEGIN;
SET LOCAL lock_timeout='3s';
CREATE TABLE public.assignment_settings(
 school_id uuid PRIMARY KEY REFERENCES public.schools(id),enabled boolean NOT NULL DEFAULT false,
 default_max_open integer CHECK(default_max_open BETWEEN 1 AND 10000),interval_minutes integer CHECK(interval_minutes BETWEEN 1 AND 1440),
 urgent_team_id uuid,auto_reassign_away boolean NOT NULL DEFAULT false,auto_reassign_overdue boolean NOT NULL DEFAULT false,
 slas jsonb NOT NULL DEFAULT '{}',last_run_at timestamptz,revision integer NOT NULL DEFAULT 0,
 CHECK(jsonb_typeof(slas)='object' AND octet_length(slas::text)<10000));
CREATE TABLE public.assignment_teams(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES public.schools(id),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
 supervisor_id uuid NOT NULL,backup_id uuid,active boolean NOT NULL DEFAULT true,UNIQUE(school_id,id),UNIQUE(school_id,name),
 FOREIGN KEY(school_id,supervisor_id) REFERENCES public.school_memberships(school_id,user_id),FOREIGN KEY(school_id,backup_id) REFERENCES public.school_memberships(school_id,user_id));
ALTER TABLE public.assignment_settings ADD FOREIGN KEY(school_id,urgent_team_id) REFERENCES public.assignment_teams(school_id,id);
CREATE TABLE public.assignment_assignees(
 school_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),active boolean NOT NULL DEFAULT true,away boolean NOT NULL DEFAULT false,
 away_until timestamptz,max_open integer CHECK(max_open BETWEEN 1 AND 10000),last_assigned_at timestamptz,notifications boolean NOT NULL DEFAULT true,
 PRIMARY KEY(school_id,user_id),FOREIGN KEY(school_id,user_id) REFERENCES public.school_memberships(school_id,user_id));
CREATE TABLE public.assignment_team_members(
 school_id uuid NOT NULL,team_id uuid NOT NULL,user_id uuid NOT NULL,PRIMARY KEY(school_id,team_id,user_id),
 FOREIGN KEY(school_id,team_id) REFERENCES public.assignment_teams(school_id,id),FOREIGN KEY(school_id,user_id) REFERENCES public.assignment_assignees(school_id,user_id));
CREATE TABLE public.assignment_rules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,item_kind text NOT NULL CHECK(item_kind IN('suggestion','report')),
 category_id uuid,team_id uuid NOT NULL,priority_order integer NOT NULL CHECK(priority_order BETWEEN 0 AND 10000),active boolean NOT NULL DEFAULT true,sla_override jsonb,
 UNIQUE(school_id,id),FOREIGN KEY(school_id,team_id) REFERENCES public.assignment_teams(school_id,id),FOREIGN KEY(school_id,category_id) REFERENCES public.categories(school_id,id));
ALTER TABLE public.submission_workflow
 ADD COLUMN assignment_team_id uuid,ADD COLUMN assigned_at timestamptz,ADD COLUMN assignment_reason text,
 ADD COLUMN acknowledged_at timestamptz,ADD COLUMN ack_due_at timestamptz,ADD COLUMN due_at timestamptz,
 ADD COLUMN assignment_version integer NOT NULL DEFAULT 0,ADD COLUMN escalation_stage integer NOT NULL DEFAULT 0,
 ADD COLUMN next_action_at timestamptz,ADD COLUMN assignment_sla jsonb,ADD FOREIGN KEY(school_id,assignment_team_id) REFERENCES public.assignment_teams(school_id,id);
CREATE UNIQUE INDEX reports_assignment_school_id ON public.reports(school_id,id);
CREATE TABLE public.report_assignments(
 report_id uuid PRIMARY KEY,school_id uuid NOT NULL,assignee_id uuid,assignment_team_id uuid,assigned_at timestamptz,assignment_reason text,
 acknowledged_at timestamptz,ack_due_at timestamptz,due_at timestamptz,assignment_version integer NOT NULL DEFAULT 0,escalation_stage integer NOT NULL DEFAULT 0,next_action_at timestamptz,assignment_sla jsonb,
 FOREIGN KEY(school_id,report_id) REFERENCES public.reports(school_id,id),FOREIGN KEY(school_id,assignee_id) REFERENCES public.school_memberships(school_id,user_id),FOREIGN KEY(school_id,assignment_team_id) REFERENCES public.assignment_teams(school_id,id));
CREATE TABLE public.assignment_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES public.schools(id),item_kind text NOT NULL CHECK(item_kind IN('suggestion','report')),item_id uuid,
 actor_id uuid,action text NOT NULL,previous jsonb,new_value jsonb,reason text NOT NULL CHECK(length(reason)<=500),cycle integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX assignment_events_item ON public.assignment_events(school_id,item_kind,item_id,created_at,id);
CREATE TABLE public.assignment_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,event_id uuid NOT NULL REFERENCES public.assignment_events(id),user_id uuid NOT NULL,
 item_kind text NOT NULL,item_id uuid,kind text NOT NULL,urgent boolean NOT NULL DEFAULT false,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(event_id,user_id),FOREIGN KEY(school_id,user_id) REFERENCES public.school_memberships(school_id,user_id));
CREATE INDEX assignment_notices_owner ON public.assignment_notifications(school_id,user_id,created_at DESC);
CREATE INDEX assignment_work_deadlines ON public.submission_workflow(school_id,next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX assignment_report_deadlines ON public.report_assignments(school_id,next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX assignment_report_owner ON public.report_assignments(school_id,assignee_id);
CREATE INDEX assignment_rule_lookup ON public.assignment_rules(school_id,item_kind,priority_order) WHERE active;
CREATE TRIGGER assignment_events_immutable BEFORE UPDATE OR DELETE ON public.assignment_events FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_audit();
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['assignment_settings','assignment_teams','assignment_assignees','assignment_team_members','assignment_rules','report_assignments','assignment_events','assignment_notifications'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role,tenant_executor',t);
 EXECUTE format('CREATE TRIGGER assignment_school_immutable BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_ownership()',t);
 END LOOP;
END $$;
CREATE VIEW public.assignment_records AS
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
REVOKE ALL ON public.assignment_records FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE FUNCTION public.assignment_staff_ids(p_school uuid,p_id uuid) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(array_agg(DISTINCT m.user_id),'{}'::uuid[]) FROM public.school_memberships m
 WHERE m.school_id=p_school AND public.school_actor_has_role(p_school,m.user_id,ARRAY['admin','moderator']) AND (
 m.role='admin' OR EXISTS(SELECT 1 FROM public.submissions s WHERE s.school_id=p_school AND s.id=p_id AND s.safety_state='clear' AND NOT s.is_urgent) AND EXISTS(SELECT 1 FROM public.submission_workflow w WHERE w.school_id=p_school AND w.submission_id=p_id AND
 (w.assignee_id=m.user_id OR EXISTS(SELECT 1 FROM public.assignment_team_members tm JOIN public.assignment_assignees a ON a.school_id=tm.school_id AND a.user_id=tm.user_id WHERE tm.school_id=p_school AND tm.team_id=w.assignment_team_id AND tm.user_id=m.user_id AND a.active))))
$$;
CREATE FUNCTION public.assignment_can_access(p_school uuid,p_actor uuid,p_kind text,p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.school_actor_has_role(p_school,p_actor,ARRAY['admin']) OR (p_kind='suggestion' AND public.school_actor_has_role(p_school,p_actor,ARRAY['moderator']) AND p_actor=ANY(public.assignment_staff_ids(p_school,p_id)) AND EXISTS(SELECT 1 FROM public.submissions WHERE school_id=p_school AND id=p_id AND safety_state='clear' AND NOT is_urgent))
$$;
CREATE FUNCTION public.assignment_validate_sla(p_value jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE key text;n integer;
BEGIN
 IF p_value IS NULL OR jsonb_typeof(p_value)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) k WHERE k NOT IN('ackMinutes','resolveMinutes','remindAfterMinutes','supervisorAfterMinutes','reassignAfterMinutes')) THEN RAISE EXCEPTION 'Complete SLA values' USING ERRCODE='22023';END IF;
 FOREACH key IN ARRAY ARRAY['ackMinutes','resolveMinutes','remindAfterMinutes','supervisorAfterMinutes','reassignAfterMinutes'] LOOP
 IF jsonb_typeof(p_value->key)<>'number' OR p_value->>key IS NULL OR (p_value->>key)!~'^[0-9]+$' THEN RAISE EXCEPTION 'Enter whole SLA minutes' USING ERRCODE='22023';END IF;
 n:=(p_value->>key)::integer;IF n NOT BETWEEN 1 AND 525600 THEN RAISE EXCEPTION 'SLA minutes out of range' USING ERRCODE='22023';END IF;
 END LOOP;
 IF (p_value->>'resolveMinutes')::integer<(p_value->>'ackMinutes')::integer OR (p_value->>'supervisorAfterMinutes')::integer<=(p_value->>'remindAfterMinutes')::integer OR (p_value->>'reassignAfterMinutes')::integer<=(p_value->>'supervisorAfterMinutes')::integer THEN RAISE EXCEPTION 'Deadlines must be in order' USING ERRCODE='22023';END IF;
END $$;
-- All allocation and override writers use this same school lock. No cached counters.
CREATE FUNCTION public.assignment_lock(p_school uuid) RETURNS void LANGUAGE sql SET search_path=pg_catalog,public AS $$ SELECT pg_advisory_xact_lock(hashtext('school-assignment'),hashtext(p_school::text)) $$;
CREATE FUNCTION public.assignment_event(p_school uuid,p_kind text,p_id uuid,p_actor uuid,p_action text,p_before jsonb,p_after jsonb,p_reason text,p_cycle integer,p_recipients uuid[],p_urgent boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE event_id uuid;recipient uuid;
BEGIN
 INSERT INTO public.assignment_events(school_id,item_kind,item_id,actor_id,action,previous,new_value,reason,cycle) VALUES(p_school,p_kind,p_id,p_actor,p_action,p_before,p_after,p_reason,p_cycle) RETURNING id INTO event_id;
 FOREACH recipient IN ARRAY coalesce(p_recipients,'{}'::uuid[]) LOOP
 IF public.school_actor_has_role(p_school,recipient,CASE WHEN p_kind='report' OR p_urgent THEN ARRAY['admin'] ELSE ARRAY['moderator','admin'] END) AND (p_urgent OR coalesce((SELECT notifications FROM public.assignment_assignees WHERE school_id=p_school AND user_id=recipient),true)) THEN
 INSERT INTO public.assignment_notifications(school_id,event_id,user_id,item_kind,item_id,kind,urgent) VALUES(p_school,event_id,recipient,p_kind,p_id,p_action,p_urgent) ON CONFLICT DO NOTHING;
 END IF;
 END LOOP;RETURN event_id;
END $$;
CREATE FUNCTION public.assignment_write(p_school uuid,p_kind text,p_id uuid,p_person uuid,p_team uuid,p_reason text,p_sla jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE relation text;id_column text;ack_at timestamptz;resolve_at timestamptz;previous_write text:=coalesce(current_setting('suggfeed.assignment_write',true),'');
BEGIN
 relation:=CASE p_kind WHEN 'suggestion' THEN 'submission_workflow' WHEN 'report' THEN 'report_assignments' END;
 id_column:=CASE p_kind WHEN 'suggestion' THEN 'submission_id' WHEN 'report' THEN 'report_id' END;
 IF relation IS NULL THEN RAISE EXCEPTION 'Invalid item kind' USING ERRCODE='22023';END IF;
 IF p_sla IS NOT NULL THEN PERFORM public.assignment_validate_sla(p_sla);ack_at:=clock_timestamp()+make_interval(mins=>(p_sla->>'ackMinutes')::integer);resolve_at:=clock_timestamp()+make_interval(mins=>(p_sla->>'resolveMinutes')::integer);END IF;
 PERFORM set_config('suggfeed.assignment_write','yes',true);
 EXECUTE format('INSERT INTO public.%I(school_id,%I,assignee_id,assignment_team_id,assigned_at,assignment_reason,ack_due_at,due_at,next_action_at,assignment_version,assignment_sla) VALUES($1,$2,$3,$4,clock_timestamp(),$5,$6,$7,$6,1,$8) ON CONFLICT(%I) DO UPDATE SET assignee_id=$3,assignment_team_id=$4,assigned_at=clock_timestamp(),assignment_reason=$5,ack_due_at=$6,due_at=$7,next_action_at=$6,acknowledged_at=NULL,assignment_version=%I.assignment_version+1,escalation_stage=0,assignment_sla=$8',relation,id_column,id_column,relation) USING p_school,p_id,p_person,p_team,p_reason,ack_at,resolve_at,p_sla;
 PERFORM set_config('suggfeed.assignment_write',previous_write,true);
END $$;
CREATE FUNCTION public.assignment_allocate(p_school uuid,p_kind text,p_id uuid,p_force boolean DEFAULT false,p_exclude uuid DEFAULT NULL,p_actor uuid DEFAULT NULL,p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item record;cfg public.assignment_settings;rule public.assignment_rules;team public.assignment_teams;chosen uuid;why text;sla jsonb;recipients uuid[];cycle integer;
BEGIN
 PERFORM public.assignment_lock(p_school);
 SELECT * INTO item FROM public.assignment_records WHERE school_id=p_school AND item_kind=p_kind AND item_id=p_id;
 IF NOT FOUND OR NOT item.is_open THEN RETURN jsonb_build_object('skipped',true);END IF;
 SELECT * INTO cfg FROM public.assignment_settings WHERE school_id=p_school;
 IF NOT coalesce(cfg.enabled,false) AND NOT item.urgent THEN RETURN jsonb_build_object('disabled',true);END IF;
 IF NOT p_force AND item.assignment_reason IS NOT NULL THEN RETURN jsonb_build_object('alreadyAssigned',true);END IF;
 IF NOT p_force AND item.assignee_id IS NOT NULL THEN RETURN jsonb_build_object('alreadyAssigned',true);END IF;
 IF item.urgent THEN SELECT * INTO team FROM public.assignment_teams WHERE school_id=p_school AND id=cfg.urgent_team_id AND active;
 ELSE
 SELECT * INTO rule FROM public.assignment_rules WHERE school_id=p_school AND item_kind=p_kind AND active AND (category_id=item.category_id OR category_id IS NULL) ORDER BY priority_order,category_id NULLS LAST,id LIMIT 1;
 SELECT * INTO team FROM public.assignment_teams WHERE school_id=p_school AND id=rule.team_id AND active;
 END IF;
 IF cfg.slas ? item.priority THEN sla:=coalesce(rule.sla_override,cfg.slas->item.priority);END IF;
 SELECT a.user_id INTO chosen FROM public.assignment_assignees a JOIN public.assignment_team_members tm ON tm.school_id=a.school_id AND tm.user_id=a.user_id
 WHERE a.school_id=p_school AND tm.team_id=team.id AND a.active AND a.user_id IS DISTINCT FROM p_exclude
 AND (NOT a.away OR a.away_until IS NOT NULL AND a.away_until<=clock_timestamp())
 AND public.school_actor_has_role(p_school,a.user_id,CASE WHEN item.restricted OR item.urgent THEN ARRAY['admin'] ELSE ARRAY['admin','moderator'] END)
 AND (item.urgent OR (SELECT count(*) FROM public.assignment_records r WHERE r.school_id=p_school AND r.assignee_id=a.user_id AND r.is_open)<coalesce(a.max_open,cfg.default_max_open,2147483647))
 ORDER BY (SELECT count(*) FROM public.assignment_records r WHERE r.school_id=p_school AND r.assignee_id=a.user_id AND r.is_open),a.last_assigned_at NULLS FIRST,random() LIMIT 1;
 IF item.urgent AND chosen IS NULL THEN
 SELECT candidate INTO chosen FROM unnest(ARRAY[team.supervisor_id,team.backup_id]) WITH ORDINALITY q(candidate,n) WHERE candidate IS DISTINCT FROM p_exclude AND public.school_actor_has_role(p_school,candidate,ARRAY['admin']) AND NOT EXISTS(SELECT 1 FROM public.assignment_assignees a WHERE a.school_id=p_school AND a.user_id=candidate AND (NOT a.active OR a.away AND (a.away_until IS NULL OR a.away_until>now()))) ORDER BY n LIMIT 1;
 IF chosen IS NULL THEN SELECT m.user_id INTO chosen FROM public.school_memberships m WHERE m.school_id=p_school AND public.school_actor_has_role(p_school,m.user_id,ARRAY['admin']) AND m.user_id IS DISTINCT FROM p_exclude AND NOT EXISTS(SELECT 1 FROM public.assignment_assignees a WHERE a.school_id=p_school AND a.user_id=m.user_id AND (NOT a.active OR a.away AND (a.away_until IS NULL OR a.away_until>now()))) ORDER BY m.created_at,m.user_id LIMIT 1;END IF;
 -- Coverage failure is visible and never rejects the student's submission.
 IF chosen IS NULL THEN SELECT m.user_id INTO chosen FROM public.school_memberships m WHERE m.school_id=p_school AND public.school_actor_has_role(p_school,m.user_id,ARRAY['admin']) ORDER BY m.user_id LIMIT 1;END IF;
 END IF;
 why:=coalesce(p_reason,CASE WHEN item.urgent THEN 'urgent-override' WHEN chosen IS NULL THEN 'triage' WHEN rule.id IS NOT NULL THEN 'rule' ELSE 'load-balanced' END);
 IF chosen IS NULL THEN why:='triage';END IF;
 PERFORM public.assignment_write(p_school,p_kind,p_id,chosen,team.id,why,sla);
 UPDATE public.assignment_assignees SET last_assigned_at=clock_timestamp() WHERE school_id=p_school AND user_id=chosen;
 SELECT assignment_version INTO cycle FROM public.assignment_records WHERE school_id=p_school AND item_kind=p_kind AND item_id=p_id;
 recipients:=array_remove(ARRAY[chosen,item.assignee_id,team.supervisor_id,CASE WHEN item.urgent THEN team.backup_id END],NULL);
 IF chosen IS NULL OR item.urgent THEN recipients:=recipients||ARRAY(SELECT user_id FROM public.school_memberships WHERE school_id=p_school AND public.school_actor_has_role(p_school,user_id,ARRAY['admin']));END IF;
 PERFORM public.assignment_event(p_school,p_kind,p_id,p_actor,why,jsonb_build_object('person',item.assignee_id,'team',item.assignment_team_id),jsonb_build_object('person',chosen,'team',team.id),why,cycle,recipients,item.urgent);
 RETURN jsonb_build_object('assignedTo',chosen,'team',team.id,'reason',why);
END $$;
CREATE FUNCTION public.assignment_incoming() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE kind text:=CASE TG_TABLE_NAME WHEN 'reports' THEN 'report' ELSE 'suggestion' END;force_assignment boolean:=false;previous_timeout text:=current_setting('lock_timeout');
BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='submissions' THEN
 IF NEW.is_urgent IS NOT DISTINCT FROM OLD.is_urgent AND NEW.safety_state IS NOT DISTINCT FROM OLD.safety_state THEN RETURN NEW;END IF;force_assignment:=NEW.is_urgent OR NEW.safety_state<>'clear';
 END IF;
 BEGIN
 PERFORM set_config('lock_timeout','500ms',true);
 PERFORM public.assignment_allocate(NEW.school_id,kind,NEW.id,force_assignment);
 EXCEPTION WHEN OTHERS THEN
 RAISE LOG 'assignment_failure school=% item=% sqlstate=%',NEW.school_id,NEW.id,SQLSTATE;
 BEGIN PERFORM public.assignment_write(NEW.school_id,kind,NEW.id,NULL,NULL,'triage',NULL);PERFORM public.assignment_event(NEW.school_id,kind,NEW.id,NULL,'assignment-failed',NULL,NULL,'triage',0,ARRAY(SELECT user_id FROM public.school_memberships WHERE school_id=NEW.school_id AND role='admin'),false);EXCEPTION WHEN OTHERS THEN NULL;END;
 END;
 PERFORM set_config('lock_timeout',previous_timeout,true);
 RETURN NEW;
END $$;
CREATE TRIGGER z_assignment_incoming AFTER INSERT OR UPDATE OF is_urgent,safety_state ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.assignment_incoming();
CREATE TRIGGER z_assignment_incoming AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.assignment_incoming();
-- Lock ownership and actor authorization are shared by every admin mutation and job.
CREATE FUNCTION public.assignment_action(p_school uuid,p_actor uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin boolean;cfg public.assignment_settings;item record;team public.assignment_teams;person uuid;tid uuid;rid uuid;key text;sla jsonb;payload jsonb;result jsonb;recipients uuid[];cycle integer;v integer;
BEGIN
 IF NOT public.school_actor_has_role(p_school,p_actor,ARRAY['admin','moderator']) THEN RAISE EXCEPTION 'Active staff membership required' USING ERRCODE='42501';END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>30000 THEN RAISE EXCEPTION 'Invalid assignment request' USING ERRCODE='22023';END IF;
 admin:=public.school_actor_has_role(p_school,p_actor,ARRAY['admin']);
 IF p_action='list' THEN
 v:=greatest(1,least(coalesce((p_data->>'page')::integer,1),100000));
 RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(
 SELECT r.*,t.name team_name,p.display_name assignee_name,(r.assignee_id=p_actor OR r.assignee_id IS NULL AND EXISTS(SELECT 1 FROM public.assignment_team_members tm WHERE tm.school_id=p_school AND tm.team_id=r.assignment_team_id AND tm.user_id=p_actor)) can_acknowledge FROM public.assignment_records r LEFT JOIN public.assignment_teams t ON t.school_id=r.school_id AND t.id=r.assignment_team_id LEFT JOIN public.profiles p ON p.id=r.assignee_id
 WHERE r.school_id=p_school AND r.is_open AND (admin OR public.assignment_can_access(p_school,p_actor,r.item_kind,r.item_id))
 AND (coalesce(p_data->>'view','mine')<>'triage' OR r.assignee_id IS NULL AND (r.assignment_reason='triage' OR r.assignment_team_id IS NULL))
 AND (coalesce(p_data->>'view','mine')<>'overdue' OR coalesce(CASE WHEN r.acknowledged_at IS NULL THEN r.ack_due_at ELSE r.due_at END,r.due_at)<now())
 AND (coalesce(p_data->>'view','mine')<>'mine' OR r.assignee_id=p_actor OR EXISTS(SELECT 1 FROM public.assignment_team_members WHERE school_id=p_school AND team_id=r.assignment_team_id AND user_id=p_actor))
 ORDER BY r.urgent DESC,coalesce(r.ack_due_at,r.due_at) NULLS LAST,r.created_at,r.item_id LIMIT 50 OFFSET (v-1)*50)q),
 'page',v,'availability',(SELECT to_jsonb(a) FROM public.assignment_assignees a WHERE school_id=p_school AND user_id=p_actor));
 ELSIF p_action='notifications' THEN
 RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT id,item_kind,item_id,kind,urgent,created_at,read_at FROM public.assignment_notifications WHERE school_id=p_school AND user_id=p_actor AND (admin OR item_kind='suggestion') ORDER BY created_at DESC,id LIMIT 50)q));
 ELSIF p_action='read-notice' THEN UPDATE public.assignment_notifications SET read_at=coalesce(read_at,clock_timestamp()) WHERE school_id=p_school AND user_id=p_actor AND id=(p_data->>'id')::uuid;RETURN '{}'::jsonb;
 ELSIF p_action='history' OR p_action='access' OR p_action='acknowledge' THEN
 rid:=(p_data->>'id')::uuid;key:=p_data->>'kind';
 IF NOT public.assignment_can_access(p_school,p_actor,key,rid) THEN RAISE EXCEPTION 'This item is outside your assigned work' USING ERRCODE='42501';END IF;
 IF p_action='access' THEN RETURN jsonb_build_object('allowed',true);END IF;
 IF p_action='history' THEN RETURN jsonb_build_object('events',(SELECT coalesce(jsonb_agg(to_jsonb(e)),'[]') FROM(SELECT id,actor_id,action,previous,new_value,reason,cycle,created_at FROM public.assignment_events WHERE school_id=p_school AND item_kind=key AND item_id=rid ORDER BY created_at DESC,id LIMIT 100)e));END IF;
 PERFORM public.assignment_lock(p_school);
 SELECT * INTO item FROM public.assignment_records WHERE school_id=p_school AND item_kind=key AND item_id=rid;
 IF (item.assignee_id IS DISTINCT FROM p_actor AND NOT(item.assignee_id IS NULL AND EXISTS(SELECT 1 FROM public.assignment_team_members tm JOIN public.assignment_assignees a ON a.school_id=tm.school_id AND a.user_id=tm.user_id WHERE tm.school_id=p_school AND tm.team_id=item.assignment_team_id AND tm.user_id=p_actor AND a.active))) OR NOT item.is_open THEN RAISE EXCEPTION 'Only the current owner can acknowledge an open item' USING ERRCODE='42501';END IF;
 IF item.acknowledged_at IS NOT NULL THEN RETURN jsonb_build_object('alreadyAcknowledged',true);END IF;
 IF key='suggestion' THEN UPDATE public.submission_workflow SET acknowledged_at=clock_timestamp(),next_action_at=due_at,escalation_stage=0 WHERE school_id=p_school AND submission_id=rid;
 ELSE UPDATE public.report_assignments SET acknowledged_at=clock_timestamp(),next_action_at=due_at,escalation_stage=0 WHERE school_id=p_school AND report_id=rid;END IF;
 PERFORM public.assignment_event(p_school,key,rid,p_actor,'acknowledged',NULL,jsonb_build_object('assignee',p_actor),'acknowledged',item.assignment_version,ARRAY[p_actor],item.urgent);RETURN jsonb_build_object('acknowledged',true);
 END IF;
 IF p_action='preferences' THEN
 IF jsonb_typeof(p_data->'notifications')<>'boolean' THEN RAISE EXCEPTION 'Choose a notification preference' USING ERRCODE='22023';END IF;
 INSERT INTO public.assignment_assignees(school_id,user_id,active,notifications) VALUES(p_school,p_actor,false,(p_data->>'notifications')::boolean) ON CONFLICT(school_id,user_id) DO UPDATE SET notifications=excluded.notifications;
 PERFORM public.assignment_event(p_school,'suggestion',NULL,p_actor,'preferences',NULL,p_data,'Notification preference changed',0,'{}',false);RETURN '{}'::jsonb;
 END IF;
 IF p_action='availability' THEN
 person:=coalesce((p_data->>'userId')::uuid,p_actor);
 IF NOT admin AND person<>p_actor THEN RAISE EXCEPTION 'Only administrators can change another staff member' USING ERRCODE='42501';END IF;
 IF NOT public.school_actor_has_role(p_school,person,ARRAY['admin','moderator']) OR jsonb_typeof(p_data->'away')<>'boolean' THEN RAISE EXCEPTION 'Choose active staff and an away state' USING ERRCODE='22023';END IF;
 IF nullif(p_data->>'awayUntil','') IS NOT NULL AND ((p_data->>'awayUntil')::timestamptz<=now() OR (p_data->>'awayUntil')::timestamptz>now()+interval '2 years') THEN RAISE EXCEPTION 'Return date must be in the future' USING ERRCODE='22023';END IF;
 PERFORM public.assignment_lock(p_school);
 INSERT INTO public.assignment_assignees(school_id,user_id,away,away_until,active) VALUES(p_school,person,(p_data->>'away')::boolean,nullif(p_data->>'awayUntil','')::timestamptz,false)
 ON CONFLICT(school_id,user_id) DO UPDATE SET away=excluded.away,away_until=excluded.away_until;
 FOR item IN SELECT * FROM public.assignment_records WHERE school_id=p_school AND assignee_id=person AND is_open LOOP
 SELECT * INTO team FROM public.assignment_teams WHERE school_id=p_school AND id=item.assignment_team_id;
 recipients:=array_remove(ARRAY[team.supervisor_id,team.backup_id],NULL)||ARRAY(SELECT user_id FROM public.school_memberships WHERE school_id=p_school AND role='admin');
 PERFORM public.assignment_event(p_school,item.item_kind,item.item_id,p_actor,'availability',NULL,p_data-'userId','Staff availability changed',item.assignment_version,recipients,item.urgent);
 IF (p_data->>'away')::boolean AND coalesce((SELECT auto_reassign_away FROM public.assignment_settings WHERE school_id=p_school),false) THEN PERFORM public.assignment_allocate(p_school,item.item_kind,item.item_id,true,person,p_actor,'away-reassigned');END IF;
 END LOOP;PERFORM public.assignment_event(p_school,'suggestion',NULL,p_actor,'availability',NULL,p_data,'Staff availability changed',0,'{}',false);RETURN '{}'::jsonb;
 END IF;
 IF NOT admin THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501';END IF;
 IF p_action='state' THEN
 RETURN jsonb_build_object('settings',(SELECT to_jsonb(s) FROM public.assignment_settings s WHERE school_id=p_school),
 'teams',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM public.assignment_teams t WHERE school_id=p_school),
 'staff',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT m.user_id,p.display_name,m.role,a.active,a.away,a.away_until,a.max_open,a.notifications FROM public.school_memberships m JOIN public.profiles p ON p.id=m.user_id LEFT JOIN public.assignment_assignees a ON a.school_id=m.school_id AND a.user_id=m.user_id WHERE m.school_id=p_school AND public.school_actor_has_role(p_school,m.user_id,ARRAY['admin','moderator']))q),
 'members',(SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]') FROM public.assignment_team_members m WHERE school_id=p_school),
 'categories',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') FROM public.categories WHERE school_id=p_school AND is_active),
 'rules',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY priority_order,id),'[]') FROM public.assignment_rules r WHERE school_id=p_school),
 'workload',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT a.user_id,p.display_name,count(r.item_id) FILTER(WHERE r.is_open) open_items,count(r.item_id) FILTER(WHERE r.is_open AND coalesce(CASE WHEN r.acknowledged_at IS NULL THEN r.ack_due_at ELSE r.due_at END,r.due_at)<now()) overdue_items,avg(extract(epoch FROM(r.acknowledged_at-r.assigned_at))/60) avg_ack_minutes FROM public.assignment_assignees a JOIN public.profiles p ON p.id=a.user_id LEFT JOIN public.assignment_records r ON r.school_id=a.school_id AND r.assignee_id=a.user_id WHERE a.school_id=p_school GROUP BY a.user_id,p.display_name)q));
 END IF;
 PERFORM public.assignment_lock(p_school);
 IF p_action='settings' THEN
 INSERT INTO public.assignment_settings(school_id) VALUES(p_school) ON CONFLICT DO NOTHING;
 SELECT * INTO cfg FROM public.assignment_settings WHERE school_id=p_school FOR UPDATE;
 IF cfg.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'Settings changed. Refresh before saving' USING ERRCODE='40001';END IF;
 IF jsonb_typeof(p_data->'enabled')<>'boolean' OR jsonb_typeof(p_data->'autoReassignAway')<>'boolean' OR jsonb_typeof(p_data->'autoReassignOverdue')<>'boolean' OR jsonb_typeof(p_data->'slas')<>'object' THEN RAISE EXCEPTION 'Invalid assignment settings' USING ERRCODE='22023';END IF;
 FOREACH key IN ARRAY ARRAY['low','normal','high','urgent'] LOOP
 IF (p_data->'slas')?key THEN PERFORM public.assignment_validate_sla(p_data->'slas'->key);ELSIF (p_data->>'enabled')::boolean THEN RAISE EXCEPTION 'Configure each priority SLA before enabling' USING ERRCODE='22023';END IF;END LOOP;
 tid:=nullif(p_data->>'urgentTeam','')::uuid;
 IF tid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.assignment_teams WHERE school_id=p_school AND id=tid AND active) THEN RAISE EXCEPTION 'Choose an active urgent team' USING ERRCODE='22023';END IF;
 IF (p_data->>'enabled')::boolean THEN
 IF tid IS NULL OR nullif(p_data->>'maxOpen','') IS NULL OR nullif(p_data->>'intervalMinutes','') IS NULL THEN RAISE EXCEPTION 'Configure urgent coverage, capacity and job interval first' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.assignment_teams t WHERE t.school_id=p_school AND t.id=tid AND t.backup_id IS NOT NULL AND public.school_actor_has_role(p_school,t.supervisor_id,ARRAY['admin']) AND public.school_actor_has_role(p_school,t.backup_id,ARRAY['admin'])) THEN RAISE EXCEPTION 'Urgent coverage requires an active admin supervisor and backup' USING ERRCODE='22023';END IF;
 FOREACH key IN ARRAY ARRAY['ackMinutes','resolveMinutes','remindAfterMinutes','supervisorAfterMinutes','reassignAfterMinutes'] LOOP IF (p_data->'slas'->'urgent'->>key)::integer>=(p_data->'slas'->'normal'->>key)::integer THEN RAISE EXCEPTION 'Urgent SLA must be faster than normal' USING ERRCODE='22023';END IF;END LOOP;
 END IF;
 IF (p_data->>'enabled')::boolean THEN FOR payload IN SELECT sla_override FROM public.assignment_rules WHERE school_id=p_school AND active AND sla_override IS NOT NULL LOOP FOREACH key IN ARRAY ARRAY['ackMinutes','resolveMinutes','remindAfterMinutes','supervisorAfterMinutes','reassignAfterMinutes'] LOOP IF (payload->>key)::integer<=(p_data->'slas'->'urgent'->>key)::integer THEN RAISE EXCEPTION 'Category SLA must leave urgent response faster' USING ERRCODE='22023';END IF;END LOOP;END LOOP;END IF;
 UPDATE public.assignment_settings SET enabled=(p_data->>'enabled')::boolean,default_max_open=nullif(p_data->>'maxOpen','')::integer,interval_minutes=nullif(p_data->>'intervalMinutes','')::integer,urgent_team_id=tid,auto_reassign_away=(p_data->>'autoReassignAway')::boolean,auto_reassign_overdue=(p_data->>'autoReassignOverdue')::boolean,slas=p_data->'slas',revision=revision+1 WHERE school_id=p_school;
 ELSIF p_action='team' THEN
 tid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());person:=(p_data->>'supervisor')::uuid;
 IF person IS NOT DISTINCT FROM nullif(p_data->>'backup','')::uuid OR NOT public.school_actor_has_role(p_school,person,ARRAY['admin']) OR nullif(p_data->>'backup','') IS NOT NULL AND NOT public.school_actor_has_role(p_school,(p_data->>'backup')::uuid,ARRAY['admin']) OR length(trim(p_data->>'name')) NOT BETWEEN 1 AND 80 OR p_data->>'name' IS NULL OR jsonb_typeof(p_data->'active')<>'boolean' THEN RAISE EXCEPTION 'Enter a team name and active admin contacts' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.assignment_teams WHERE id=tid AND school_id<>p_school) THEN RAISE EXCEPTION 'Team unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO public.assignment_teams(id,school_id,name,supervisor_id,backup_id,active) VALUES(tid,p_school,trim(p_data->>'name'),person,nullif(p_data->>'backup','')::uuid,(p_data->>'active')::boolean)
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,supervisor_id=excluded.supervisor_id,backup_id=excluded.backup_id,active=excluded.active;
 ELSIF p_action='assignee' THEN
 person:=(p_data->>'userId')::uuid;
 IF NOT public.school_actor_has_role(p_school,person,ARRAY['admin','moderator']) OR jsonb_typeof(p_data->'active')<>'boolean' OR jsonb_typeof(p_data->'notifications')<>'boolean' THEN RAISE EXCEPTION 'Choose an active staff member' USING ERRCODE='22023';END IF;
 INSERT INTO public.assignment_assignees(school_id,user_id,active,max_open,notifications) VALUES(p_school,person,(p_data->>'active')::boolean,nullif(p_data->>'maxOpen','')::integer,(p_data->>'notifications')::boolean)
 ON CONFLICT(school_id,user_id) DO UPDATE SET active=excluded.active,max_open=excluded.max_open,notifications=excluded.notifications;
 IF p_data->'teams' IS NULL OR jsonb_typeof(p_data->'teams')<>'array' OR jsonb_array_length(p_data->'teams')>100 THEN RAISE EXCEPTION 'Choose valid teams' USING ERRCODE='22023';END IF;
 DELETE FROM public.assignment_team_members WHERE school_id=p_school AND user_id=person;
 FOR key IN SELECT jsonb_array_elements_text(p_data->'teams') LOOP
 IF NOT EXISTS(SELECT 1 FROM public.assignment_teams WHERE school_id=p_school AND id=key::uuid) THEN RAISE EXCEPTION 'Team unavailable' USING ERRCODE='22023';END IF;
 INSERT INTO public.assignment_team_members VALUES(p_school,key::uuid,person) ON CONFLICT DO NOTHING;END LOOP;
 ELSIF p_action='rule' THEN
 tid:=(p_data->>'team')::uuid;rid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
 IF p_data->>'kind' IS NULL OR p_data->>'kind' NOT IN('suggestion','report') OR NOT EXISTS(SELECT 1 FROM public.assignment_teams WHERE school_id=p_school AND id=tid AND active) OR jsonb_typeof(p_data->'active')<>'boolean' THEN RAISE EXCEPTION 'Choose a type and an active team' USING ERRCODE='22023';END IF;
 IF p_data->'sla' IS NOT NULL AND p_data->'sla'<>'null'::jsonb THEN PERFORM public.assignment_validate_sla(p_data->'sla');SELECT slas->'urgent' INTO sla FROM public.assignment_settings WHERE school_id=p_school;IF sla IS NOT NULL THEN FOREACH key IN ARRAY ARRAY['ackMinutes','resolveMinutes','remindAfterMinutes','supervisorAfterMinutes','reassignAfterMinutes'] LOOP IF (p_data->'sla'->>key)::integer<=(sla->>key)::integer THEN RAISE EXCEPTION 'Category SLA must leave urgent response faster' USING ERRCODE='22023';END IF;END LOOP;END IF;END IF;
 IF EXISTS(SELECT 1 FROM public.assignment_rules WHERE id=rid AND school_id<>p_school) THEN RAISE EXCEPTION 'Rule unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO public.assignment_rules(id,school_id,item_kind,category_id,team_id,priority_order,active,sla_override) VALUES(rid,p_school,p_data->>'kind',nullif(p_data->>'category','')::uuid,tid,(p_data->>'order')::integer,(p_data->>'active')::boolean,nullif(p_data->'sla','null'::jsonb))
 ON CONFLICT(id) DO UPDATE SET item_kind=excluded.item_kind,category_id=excluded.category_id,team_id=excluded.team_id,priority_order=excluded.priority_order,active=excluded.active,sla_override=excluded.sla_override;
 ELSIF p_action='assign' OR p_action='retry' THEN
 key:=p_data->>'kind';rid:=(p_data->>'id')::uuid;SELECT * INTO item FROM public.assignment_records WHERE school_id=p_school AND item_kind=key AND item_id=rid;
 IF NOT FOUND OR NOT item.is_open THEN RAISE EXCEPTION 'Open item required' USING ERRCODE='P0002';END IF;
 IF p_action='retry' THEN IF item.assignee_id IS NOT NULL OR item.assignment_version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Assignment changed. Refresh first' USING ERRCODE='40001';END IF;RETURN public.assignment_allocate(p_school,key,rid,true,NULL,p_actor,'load-balanced');END IF;
 IF item.assignment_version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Assignment changed. Refresh first' USING ERRCODE='40001';END IF;
 IF jsonb_typeof(p_data->'note')<>'string' OR length(trim(p_data->>'note')) NOT BETWEEN 3 AND 500 OR p_data->>'note' IS NULL THEN RAISE EXCEPTION 'Add an assignment reason' USING ERRCODE='22023';END IF;
 person:=nullif(p_data->>'person','')::uuid;tid:=nullif(p_data->>'team','')::uuid;
 IF person IS NULL AND tid IS NULL THEN RAISE EXCEPTION 'Choose a person or team' USING ERRCODE='22023';END IF;
 IF person IS NOT NULL AND NOT public.school_actor_has_role(p_school,person,CASE WHEN item.restricted OR item.urgent THEN ARRAY['admin'] ELSE ARRAY['admin','moderator'] END) THEN RAISE EXCEPTION 'Choose an eligible staff member' USING ERRCODE='22023';END IF;
 IF tid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.assignment_teams WHERE school_id=p_school AND id=tid AND active) THEN RAISE EXCEPTION 'Choose an active team' USING ERRCODE='22023';END IF;
 IF item.urgent AND person IS NULL THEN RAISE EXCEPTION 'Urgent work requires a named administrator' USING ERRCODE='22023';END IF;
 SELECT slas->item.priority INTO sla FROM public.assignment_settings WHERE school_id=p_school;
 PERFORM public.assignment_write(p_school,key,rid,person,tid,'manual',sla);
 recipients:=ARRAY[item.assignee_id,person]||ARRAY(SELECT user_id FROM public.assignment_team_members WHERE school_id=p_school AND team_id=tid);
 PERFORM public.assignment_event(p_school,key,rid,p_actor,'manual',jsonb_build_object('person',item.assignee_id,'team',item.assignment_team_id),jsonb_build_object('person',person,'team',tid),trim(p_data->>'note'),item.assignment_version+1,recipients,item.urgent);RETURN '{}'::jsonb;
 ELSE RAISE EXCEPTION 'Unknown assignment action' USING ERRCODE='22023';END IF;
 PERFORM public.assignment_event(p_school,'suggestion',NULL,p_actor,p_action,NULL,p_data-'slas','Assignment configuration changed',0,'{}',false);
 RETURN '{}'::jsonb;
END $$;
CREATE FUNCTION public.assignment_tick(p_limit integer DEFAULT 100) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cfg public.assignment_settings;item record;team public.assignment_teams;sla jsonb;deadline timestamptz;phase text;action text;next_stage integer;next_at timestamptz;processed integer:=0;schools integer:=0;recipients uuid[];
BEGIN
 IF p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid batch limit' USING ERRCODE='22023';END IF;
 FOR cfg IN SELECT s.* FROM public.assignment_settings s JOIN public.schools school ON school.id=s.school_id AND school.status='active' WHERE s.enabled AND (s.last_run_at IS NULL OR s.last_run_at+make_interval(mins=>s.interval_minutes)<=clock_timestamp()) ORDER BY s.last_run_at NULLS FIRST,s.school_id LIMIT 100 LOOP
 IF processed>=p_limit THEN EXIT;END IF;
 IF NOT pg_try_advisory_xact_lock(hashtext('school-assignment'),hashtext(cfg.school_id::text)) THEN CONTINUE;END IF;
 SELECT * INTO cfg FROM public.assignment_settings WHERE school_id=cfg.school_id FOR UPDATE;
 IF cfg.last_run_at IS NOT NULL AND cfg.last_run_at+make_interval(mins=>cfg.interval_minutes)>clock_timestamp() THEN CONTINUE;END IF;
 schools:=schools+1;
 FOR item IN SELECT * FROM public.assignment_records WHERE school_id=cfg.school_id AND is_open AND next_action_at<=clock_timestamp()+make_interval(mins=>cfg.interval_minutes) ORDER BY urgent DESC,next_action_at,item_id LIMIT p_limit LOOP
 BEGIN
 IF processed>=p_limit THEN EXIT;END IF;
 sla:=coalesce(item.assignment_sla,cfg.slas->item.priority);IF sla IS NULL THEN CONTINUE;END IF;
 deadline:=CASE WHEN item.acknowledged_at IS NULL THEN item.ack_due_at ELSE item.due_at END;phase:=CASE WHEN item.acknowledged_at IS NULL THEN 'ack' ELSE 'resolve' END;
 IF deadline IS NULL THEN CONTINUE;END IF;
 SELECT * INTO team FROM public.assignment_teams WHERE school_id=cfg.school_id AND id=item.assignment_team_id;
 recipients:=CASE WHEN item.assignee_id IS NOT NULL THEN ARRAY[item.assignee_id] ELSE ARRAY(SELECT user_id FROM public.assignment_team_members WHERE school_id=cfg.school_id AND team_id=item.assignment_team_id) END;
 IF deadline>clock_timestamp() THEN
 IF NOT EXISTS(SELECT 1 FROM public.assignment_events WHERE school_id=cfg.school_id AND item_kind=item.item_kind AND item_id=item.item_id AND cycle=item.assignment_version AND action='approaching-'||phase) THEN
 PERFORM public.assignment_event(cfg.school_id,item.item_kind,item.item_id,NULL,'approaching-'||phase,NULL,NULL,'Deadline approaching',item.assignment_version,recipients,item.urgent);END IF;
 IF item.item_kind='suggestion' THEN UPDATE public.submission_workflow SET next_action_at=deadline+make_interval(mins=>(sla->>'remindAfterMinutes')::integer) WHERE school_id=cfg.school_id AND submission_id=item.item_id;ELSE UPDATE public.report_assignments SET next_action_at=deadline+make_interval(mins=>(sla->>'remindAfterMinutes')::integer) WHERE school_id=cfg.school_id AND report_id=item.item_id;END IF;
 CONTINUE;
 END IF;
 IF item.escalation_stage=0 AND deadline+make_interval(mins=>(sla->>'remindAfterMinutes')::integer)<=now() THEN
 action:='reminder-'||phase;next_stage:=1;next_at:=deadline+make_interval(mins=>(sla->>'supervisorAfterMinutes')::integer);
 PERFORM public.assignment_event(cfg.school_id,item.item_kind,item.item_id,NULL,action,NULL,NULL,'Deadline missed: owner reminded',item.assignment_version,recipients,item.urgent);
 ELSIF item.escalation_stage=1 AND deadline+make_interval(mins=>(sla->>'supervisorAfterMinutes')::integer)<=now() THEN
 action:='supervisor-'||phase;next_stage:=2;next_at:=deadline+make_interval(mins=>(sla->>'reassignAfterMinutes')::integer);
 PERFORM public.assignment_event(cfg.school_id,item.item_kind,item.item_id,NULL,action,NULL,NULL,'Unattended item escalated to supervisor',item.assignment_version,array_remove(ARRAY[team.supervisor_id,team.backup_id],NULL)||ARRAY(SELECT user_id FROM public.school_memberships WHERE school_id=cfg.school_id AND role='admin'),item.urgent);
 ELSIF item.escalation_stage=2 AND deadline+make_interval(mins=>(sla->>'reassignAfterMinutes')::integer)<=now() THEN
 IF cfg.auto_reassign_overdue THEN
 PERFORM public.assignment_allocate(cfg.school_id,item.item_kind,item.item_id,true,item.assignee_id,NULL,'escalated');processed:=processed+1;CONTINUE;
 END IF;
 next_stage:=3;next_at:=NULL;PERFORM public.assignment_event(cfg.school_id,item.item_kind,item.item_id,NULL,'manual-escalation-'||phase,NULL,NULL,'Administrator reassignment required',item.assignment_version,ARRAY(SELECT user_id FROM public.school_memberships WHERE school_id=cfg.school_id AND role='admin'),item.urgent);
 ELSE CONTINUE;END IF;
 IF item.item_kind='suggestion' THEN UPDATE public.submission_workflow SET escalation_stage=next_stage,next_action_at=next_at WHERE school_id=cfg.school_id AND submission_id=item.item_id;
 ELSE UPDATE public.report_assignments SET escalation_stage=next_stage,next_action_at=next_at WHERE school_id=cfg.school_id AND report_id=item.item_id;END IF;
 processed:=processed+1;
 EXCEPTION WHEN OTHERS THEN RAISE LOG 'assignment_job_failure school=% item=% sqlstate=%',cfg.school_id,item.item_id,SQLSTATE;
 END;
 END LOOP;
 UPDATE public.assignment_settings SET last_run_at=clock_timestamp() WHERE school_id=cfg.school_id;
 END LOOP;RETURN jsonb_build_object('processed',processed,'schools',schools);
END $$;
-- Existing manual UI must use the audited override operation rather than old setters.
CREATE FUNCTION public.assignment_legacy_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF coalesce(current_setting('suggfeed.assignment_write',true),'')='yes' THEN RETURN NEW;END IF;
 IF TG_OP='INSERT' AND NEW.assignee_id IS NOT NULL OR TG_OP='UPDATE' AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN RAISE EXCEPTION 'Use Assignment routing and provide a reason' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assignment_legacy_guard BEFORE INSERT OR UPDATE OF assignee_id ON public.submission_workflow FOR EACH ROW EXECUTE FUNCTION public.assignment_legacy_guard();
CREATE FUNCTION public.assignment_priority_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.priority='urgent' AND OLD.priority IS DISTINCT FROM NEW.priority THEN
 BEGIN PERFORM public.assignment_allocate(NEW.school_id,'suggestion',NEW.submission_id,true,NULL,NULL,'urgent-override');EXCEPTION WHEN OTHERS THEN RAISE LOG 'assignment_urgent_failure school=% item=% sqlstate=%',NEW.school_id,NEW.submission_id,SQLSTATE;END;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER assignment_priority_changed AFTER UPDATE OF priority ON public.submission_workflow FOR EACH ROW EXECUTE FUNCTION public.assignment_priority_changed();
-- Restrictive policies add assigned/team authorization to every existing staff RPC.
CREATE FUNCTION public.assignment_rpc_readable(p_school uuid,p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT NOT public.school_actor_has_role(p_school,public.tenant_actor_id(),ARRAY['moderator']) OR coalesce(current_setting('suggfeed.rpc_name',true),'') NOT IN(
 'save_staff_review','staff_workflow_context','staff_workflow_snapshot','repair_work_dates','bind_progress_draft','perform_workflow_action','post_idea_update','reserve_progress_upload','finalize_progress_upload','cancel_progress_upload','read_staff_idea_update_files','moderate_submission','review_submission_transition') AND NOT(coalesce(current_setting('suggfeed.rpc_name',true),'')='community_action' AND current_setting('suggfeed.assignment_scope',true)='staff') OR public.assignment_can_access(p_school,public.tenant_actor_id(),'suggestion',p_id)
$$;
CREATE POLICY assigned_staff_submission ON public.submissions AS RESTRICTIVE FOR SELECT TO tenant_executor USING(public.assignment_rpc_readable(school_id,id));
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['submission_workflow','staff_internal_notes','staff_workflow_history','idea_clarifications','idea_updates','idea_update_drafts','work_date_repairs'] LOOP
 EXECUTE format('CREATE POLICY assigned_staff_private ON public.%I AS RESTRICTIVE TO tenant_executor USING(public.assignment_rpc_readable(school_id,submission_id))',t);
 END LOOP;
END $$;
CREATE POLICY assigned_staff_upload ON public.idea_update_uploads AS RESTRICTIVE TO tenant_executor USING(EXISTS(SELECT 1 FROM public.idea_update_drafts d WHERE d.school_id=idea_update_uploads.school_id AND d.request_id=idea_update_uploads.request_id AND (d.submission_id IS NULL OR public.assignment_rpc_readable(d.school_id,d.submission_id))));
CREATE VIEW public.staff_assigned_submissions WITH(security_invoker=true) AS SELECT s.*,public.assignment_staff_ids(s.school_id,s.id) assignment_staff_ids FROM public.submissions s;
CREATE VIEW public.staff_assignment_queue WITH(security_invoker=true) AS SELECT q.*,public.assignment_staff_ids(q.school_id,q.id) assignment_staff_ids FROM public.staff_submission_queue q;
CREATE VIEW public.staff_assignment_stale WITH(security_invoker=true) AS SELECT q.*,public.assignment_staff_ids(q.school_id,q.id) assignment_staff_ids FROM public.staff_stale_work q;
CREATE VIEW public.staff_assignment_notes WITH(security_invoker=true) AS SELECT n.*,public.assignment_staff_ids(n.school_id,n.submission_id) assignment_staff_ids FROM public.staff_internal_notes n;
CREATE VIEW public.staff_assignment_history WITH(security_invoker=true) AS SELECT n.*,public.assignment_staff_ids(n.school_id,n.submission_id) assignment_staff_ids FROM public.staff_workflow_history n;
CREATE VIEW public.staff_assignment_clarifications WITH(security_invoker=true) AS SELECT n.*,public.assignment_staff_ids(n.school_id,n.submission_id) assignment_staff_ids FROM public.idea_clarifications n;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['staff_assigned_submissions','staff_assignment_queue','staff_assignment_stale','staff_assignment_notes','staff_assignment_history','staff_assignment_clarifications'] LOOP EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,tenant_executor,service_role',t);EXECUTE format('GRANT SELECT ON public.%I TO service_role',t);END LOOP;
END $$;
-- Keep actor binding and existing RPC catalog validation; block legacy bulk overrides.
ALTER FUNCTION public.tenant_rpc(uuid,uuid,text,jsonb) RENAME TO tenant_rpc_before_assignment;
REVOKE ALL ON FUNCTION public.tenant_rpc_before_assignment(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE FUNCTION public.tenant_rpc(p_school_id uuid,p_actor_id uuid,p_function text,p_args jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;previous_scope text:=coalesce(current_setting('suggfeed.assignment_scope',true),'');
BEGIN
 PERFORM set_config('suggfeed.assignment_scope',CASE WHEN p_function='community_action' AND p_args->>'p_action' IN('request','close','merge','resolve','bulk_assign') THEN 'staff' ELSE 'public' END,true);
 IF p_function='community_action' AND p_args->>'p_action'='bulk_assign' THEN RAISE EXCEPTION 'Use audited Assignment routing' USING ERRCODE='42501';END IF;
 IF p_function='save_staff_review' THEN PERFORM public.assignment_lock(p_school_id);END IF;
 result:=public.tenant_rpc_before_assignment(p_school_id,p_actor_id,p_function,p_args);PERFORM set_config('suggfeed.assignment_scope',previous_scope,true);RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.tenant_rpc(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT EXECUTE ON FUNCTION public.tenant_rpc(uuid,uuid,text,jsonb) TO service_role;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'assignment_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,tenant_executor,service_role',f.signature);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.assignment_action(uuid,uuid,text,jsonb),public.assignment_tick(integer),public.assignment_staff_ids(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assignment_can_access(uuid,uuid,text,uuid),public.assignment_rpc_readable(uuid,uuid) TO tenant_executor;
NOTIFY pgrst,'reload schema';
COMMIT;
