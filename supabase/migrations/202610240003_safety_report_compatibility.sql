BEGIN;
-- Keep deployed/cached report clients working during the web rollout. All writes
-- still use the new uniqueness, quota, threshold and school authorization checks.
DO $$ DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('public.community_action(uuid,text,jsonb)'::regprocedure) INTO definition;
 IF position('Use the safety review service' in definition)=0 THEN RAISE EXCEPTION 'Expected safety guard missing';END IF;
 definition:=replace(definition,
  'IF p_action=''report'' OR p_action=''resolve'' THEN RAISE EXCEPTION ''Use the safety review service'' USING ERRCODE=''42501'';END IF;',
  $guard$IF p_action='report' AND p_data->>'commentId' IS NULL THEN
   RETURN public.submission_safety_action('report',jsonb_build_object('id',p_data->>'submissionId','reason',coalesce(nullif(trim(p_data->>'body'),''),'Reported for school administrator review.'),'policy',jsonb_build_object('limit',20,'windowSeconds',3600,'reportThreshold',3)));
  ELSIF p_action IN('report','resolve') THEN RAISE EXCEPTION 'Use the safety review service' USING ERRCODE='42501';END IF;$guard$);
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
