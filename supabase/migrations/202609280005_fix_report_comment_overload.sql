-- Drop overloaded legacy report_comment(uuid) function to resolve ambiguity
DROP FUNCTION IF EXISTS public.report_comment(uuid);
DROP FUNCTION IF EXISTS public.report_comment(uuid, text);

CREATE OR REPLACE FUNCTION public.report_comment(target_id uuid, report_reason text DEFAULT 'inappropriate')
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_user_id uuid := auth.uid();
  already_reported boolean;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.reports WHERE user_id = current_user_id AND comment_id = target_id
  ) INTO already_reported;

  IF already_reported THEN
    RETURN json_build_object('success', false, 'message', 'already_reported');
  END IF;

  INSERT INTO public.reports (user_id, comment_id, reason)
  VALUES (current_user_id, target_id, coalesce(report_reason, 'inappropriate'));

  UPDATE public.comments
  SET report_count = coalesce(report_count, 0) + 1
  WHERE id = target_id;

  RETURN json_build_object('success', true);
END;
$$;
