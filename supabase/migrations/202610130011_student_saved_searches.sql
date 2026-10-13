BEGIN;
CREATE FUNCTION public.valid_student_search(filters jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT jsonb_typeof(filters)='object'
 AND filters-ARRAY['sort','category','search','scope']='{}'::jsonb
 AND jsonb_typeof(filters->'sort')='string' AND filters->>'sort' IN ('all','latest','top','popular','oldest')
 AND jsonb_typeof(filters->'category')='string' AND filters->>'category' IN ('All','Facilities','Learning','Safety','Student life','Other')
 AND jsonb_typeof(filters->'search')='string' AND length(filters->>'search')<=120
 AND jsonb_typeof(filters->'scope')='string' AND filters->>'scope' IN ('all','following')
$$;
CREATE TABLE public.student_saved_searches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 40),
 filters jsonb NOT NULL CHECK(public.valid_student_search(filters) IS TRUE),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,name)
);
CREATE INDEX student_saved_search_owner_idx ON public.student_saved_searches(user_id,created_at);
ALTER TABLE public.student_saved_searches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_saved_searches FROM public,anon,authenticated;
GRANT SELECT ON public.student_saved_searches TO authenticated;
CREATE POLICY "students read own searches" ON public.student_saved_searches FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT ALL ON public.student_saved_searches TO service_role;
CREATE FUNCTION public.save_student_search(p_user uuid,p_name text,p_filters jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.student_saved_searches;
BEGIN
 IF p_user IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 40 OR public.valid_student_search(p_filters) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Invalid saved search' USING ERRCODE='22023';
 END IF;
 -- Serialize concurrent creates for the same account so the ten-search limit holds.
 PERFORM pg_advisory_xact_lock(hashtext('student-search'),hashtext(p_user::text));
 IF (SELECT count(*) FROM public.student_saved_searches WHERE user_id=p_user)>=10 THEN
  RAISE EXCEPTION 'Ten saved searches maximum' USING ERRCODE='54000';
 END IF;
 INSERT INTO public.student_saved_searches(user_id,name,filters) VALUES(p_user,trim(p_name),p_filters) RETURNING * INTO result;
 RETURN to_jsonb(result)-'user_id';
END $$;
REVOKE ALL ON FUNCTION public.save_student_search(uuid,text,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_student_search(uuid,text,jsonb) TO service_role;
COMMIT;
