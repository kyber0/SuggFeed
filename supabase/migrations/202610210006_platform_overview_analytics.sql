BEGIN;
CREATE FUNCTION public.platform_overview_analytics(p_actor uuid,p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Manila')::date; starts timestamptz; previous_starts timestamptz; schools jsonb; ideas jsonb; trend jsonb; members bigint; previous_total bigint;
BEGIN
 IF NOT public.platform_operator_active(p_actor) THEN RAISE EXCEPTION 'Platform operator required' USING ERRCODE='42501'; END IF;
 IF p_days IS NULL OR p_days NOT IN(7,30,90) THEN RAISE EXCEPTION 'Invalid reporting period' USING ERRCODE='22023'; END IF;
 starts:=((today-(p_days-1))::timestamp AT TIME ZONE 'Asia/Manila');
 previous_starts:=((today-(p_days*2-1))::timestamp AT TIME ZONE 'Asia/Manila');
 SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE status='active'),'pending',count(*) FILTER(WHERE status='pending'),'suspended',count(*) FILTER(WHERE status='suspended'),'closed',count(*) FILTER(WHERE status='closed')) INTO schools FROM public.schools;
 SELECT jsonb_build_object('all',count(*),'pending',count(*) FILTER(WHERE status='pending'),'approved',count(*) FILTER(WHERE status='approved'),'in_progress',count(*) FILTER(WHERE status='in_progress'),'resolved',count(*) FILTER(WHERE status='resolved'),'rejected',count(*) FILTER(WHERE status='rejected')) INTO ideas FROM public.submissions;
 SELECT count(*) INTO members FROM public.school_memberships m JOIN public.schools s ON s.id=m.school_id WHERE m.status='active' AND s.status='active';
 SELECT count(*) INTO previous_total FROM public.submissions WHERE created_at>=previous_starts AND created_at<starts;
 WITH days AS (SELECT generate_series(today-(p_days-1),today,'1 day'::interval)::date AS day),
 daily AS (SELECT (created_at AT TIME ZONE 'Asia/Manila')::date AS day,count(*) AS count FROM public.submissions WHERE created_at>=starts AND created_at<=now() GROUP BY 1)
 SELECT jsonb_agg(jsonb_build_object('key',days.day::text,'submissions',coalesce(daily.count,0)) ORDER BY days.day) INTO trend FROM days LEFT JOIN daily USING(day);
 RETURN jsonb_build_object('schools',schools,'ideas',ideas,'memberships',members,'timeline',trend,'previous_total',previous_total,'captured_at',now(),'days',p_days);
END $$;
REVOKE ALL ON FUNCTION public.platform_overview_analytics(uuid,integer) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT EXECUTE ON FUNCTION public.platform_overview_analytics(uuid,integer) TO service_role;
COMMIT;
