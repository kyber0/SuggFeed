BEGIN;
-- Read projections only: existing write RPCs, memberships and release gates are unchanged.
CREATE INDEX IF NOT EXISTS school_registry_events_recent_idx ON public.school_registry_events(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS school_registry_events_grant_idx ON public.school_registry_events(school_id,created_at DESC,id DESC) WHERE action='customization_rollout';
CREATE OR REPLACE FUNCTION public.platform_dashboard_counts(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('schools',(SELECT count(*) FROM public.schools),'applications',(SELECT count(*) FROM public.school_applications WHERE status='pending'),'policies',(SELECT count(*) FROM public.schools s WHERE s.status<>'closed' AND (EXISTS(SELECT 1 FROM public.school_policy_drafts d WHERE d.school_id=s.id) OR EXISTS(SELECT 1 FROM public.school_settings t WHERE t.school_id=s.id AND t.approved_at IS NULL AND length(btrim(t.privacy_notice))>=20 AND length(btrim(t.terms_notice))>=20 AND length(btrim(t.age_policy))>=10 AND t.privacy_contact<>'' AND t.school_contact<>''))),'forms',(SELECT count(*) FROM public.school_customization_state c JOIN public.schools s ON s.id=c.school_id WHERE c.review_requested_at IS NOT NULL AND s.status<>'closed'),'pending',(SELECT count(*) FROM public.schools WHERE status='pending'),'captured_at',now());
END $$;
CREATE OR REPLACE FUNCTION public.platform_review_queue(p_actor uuid,p_type text,p_page integer DEFAULT 0,p_search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 IF p_type NOT IN('applications','policies','forms') OR p_page IS NULL OR p_page NOT BETWEEN 0 AND 10000 OR p_search IS NULL OR length(p_search)>100 THEN RAISE EXCEPTION 'Invalid queue' USING ERRCODE='22023'; END IF;
 WITH queue AS (
 SELECT a.id,a.name,a.slug,a.created_at AS submitted_at,NULL::integer AS version FROM public.school_applications a WHERE p_type='applications' AND a.status='pending'
 UNION ALL
 SELECT s.id,s.name,s.slug,coalesce(d.updated_at,t.updated_at),coalesce(d.version,t.version) FROM public.schools s LEFT JOIN public.school_settings t ON t.school_id=s.id LEFT JOIN public.school_policy_drafts d ON d.school_id=s.id WHERE p_type='policies' AND s.status<>'closed' AND (d.school_id IS NOT NULL OR t.school_id IS NOT NULL AND t.approved_at IS NULL AND length(btrim(t.privacy_notice))>=20 AND length(btrim(t.terms_notice))>=20 AND length(btrim(t.age_policy))>=10 AND t.privacy_contact<>'' AND t.school_contact<>'')
 UNION ALL
 SELECT s.id,s.name,s.slug,c.review_requested_at,c.revision FROM public.school_customization_state c JOIN public.schools s ON s.id=c.school_id WHERE p_type='forms' AND c.review_requested_at IS NOT NULL AND s.status<>'closed'
 ), matching AS (SELECT * FROM queue WHERE strpos(lower(name),lower(btrim(p_search)))>0), rows AS (SELECT * FROM matching ORDER BY submitted_at,id LIMIT 20 OFFSET p_page*20)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'items',coalesce((SELECT jsonb_agg(to_jsonb(rows) ORDER BY submitted_at,id) FROM rows),'[]'::jsonb)) INTO result;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.platform_editor_schools(p_actor uuid,p_page integer DEFAULT 0,p_search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 0 AND 10000 OR p_search IS NULL OR length(p_search)>100 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 WITH matching AS (SELECT id,name,slug,status FROM public.schools WHERE strpos(lower(name),lower(btrim(p_search)))>0), paged AS MATERIALIZED(SELECT * FROM matching ORDER BY name,id LIMIT 20 OFFSET p_page*20), rows AS (
 SELECT s.*,coalesce(c.editing_enabled,false) AS editing_enabled,c.review_requested_at,e.created_at AS changed_at,p.display_name AS changed_by FROM paged s LEFT JOIN public.school_customization_state c ON c.school_id=s.id LEFT JOIN LATERAL(SELECT actor_id,created_at FROM public.school_registry_events WHERE school_id=s.id AND action='customization_rollout' ORDER BY created_at DESC,id DESC LIMIT 1)e ON true LEFT JOIN public.profiles p ON p.id=e.actor_id ORDER BY s.name,s.id)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'items',coalesce((SELECT jsonb_agg(to_jsonb(rows) ORDER BY name,id) FROM rows),'[]'::jsonb)) INTO result;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.platform_activity(p_actor uuid,p_page integer DEFAULT 0,p_school uuid DEFAULT NULL,p_action text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 0 AND 10000 OR p_action IS NULL OR p_action NOT IN('','created','status_changed','customization_rollout','customization_reviewed','customization_published') THEN RAISE EXCEPTION 'Invalid activity filter' USING ERRCODE='22023'; END IF;
 WITH matching AS (SELECT e.id,e.school_id,e.actor_id,e.action,e.created_at,jsonb_strip_nulls(jsonb_build_object('from',coalesce(e.detail->'from',e.detail->'previous'),'to',coalesce(e.detail->'to',e.detail->'status'),'reason',e.detail->'reason','enabled',e.detail->'enabled','version',e.detail->'version','revision',e.detail->'revision','policy_version',e.detail->'policy_version')) AS detail FROM public.school_registry_events e WHERE e.action IN('created','status_changed','customization_rollout','customization_reviewed','customization_published') AND (p_school IS NULL OR e.school_id=p_school) AND (p_action='' OR e.action=p_action)), rows AS (SELECT e.id,e.school_id,e.action,e.created_at,e.detail,s.name AS school_name,p.display_name AS actor_name FROM matching e JOIN public.schools s ON s.id=e.school_id LEFT JOIN public.profiles p ON p.id=e.actor_id ORDER BY e.created_at DESC,e.id DESC LIMIT 20 OFFSET p_page*20)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'items',coalesce((SELECT jsonb_agg(to_jsonb(rows) ORDER BY created_at DESC,id DESC) FROM rows),'[]'::jsonb)) INTO result;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.platform_insights(p_actor uuid,p_days integer DEFAULT 30,p_include_demo boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Manila')::date;starts timestamptz;previous_starts timestamptz;result jsonb;demo uuid:='00000000-0000-4000-8000-000000000001';
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 IF p_days IS NULL OR p_days NOT IN(7,30,90) OR p_include_demo IS NULL THEN RAISE EXCEPTION 'Invalid reporting period' USING ERRCODE='22023'; END IF;
 starts:=((today-(p_days-1))::timestamp AT TIME ZONE 'Asia/Manila');previous_starts:=starts-make_interval(days=>p_days);
 WITH scope AS (SELECT id,status FROM public.schools WHERE p_include_demo OR id<>demo), ideas AS (SELECT x.status,x.created_at FROM public.submissions x JOIN scope s ON s.id=x.school_id), days AS (SELECT generate_series(today-(p_days-1),today,'1 day'::interval)::date AS day), daily AS (SELECT (created_at AT TIME ZONE 'Asia/Manila')::date AS day,count(*) AS count FROM ideas WHERE created_at>=starts AND created_at<=now() GROUP BY 1)
 SELECT jsonb_build_object('schools',(SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE status='active'),'pending',count(*) FILTER(WHERE status='pending'),'suspended',count(*) FILTER(WHERE status='suspended'),'closed',count(*) FILTER(WHERE status='closed')) FROM scope),'ideas',(SELECT jsonb_build_object('all',count(*),'resolved',count(*) FILTER(WHERE status='resolved'),'pending',count(*) FILTER(WHERE status='pending')) FROM ideas),'memberships',(SELECT count(*) FROM public.school_memberships m JOIN scope s ON s.id=m.school_id WHERE s.status='active' AND m.status='active'),'previous_total',(SELECT count(*) FROM ideas WHERE created_at>=previous_starts AND created_at<=now()-make_interval(days=>p_days)),'timeline',(SELECT jsonb_agg(jsonb_build_object('key',days.day::text,'submissions',coalesce(daily.count,0)) ORDER BY days.day) FROM days LEFT JOIN daily USING(day)),'captured_at',now(),'days',p_days,'include_demo',p_include_demo) INTO result;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.platform_dashboard_counts(uuid),public.platform_review_queue(uuid,text,integer,text),public.platform_editor_schools(uuid,integer,text),public.platform_activity(uuid,integer,uuid,text),public.platform_insights(uuid,integer,boolean) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT EXECUTE ON FUNCTION public.platform_dashboard_counts(uuid),public.platform_review_queue(uuid,text,integer,text),public.platform_editor_schools(uuid,integer,text),public.platform_activity(uuid,integer,uuid,text),public.platform_insights(uuid,integer,boolean) TO service_role;
COMMIT;
