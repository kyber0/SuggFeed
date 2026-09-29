-- Migration: Add user status check RPC and auto-repair any missing profiles from auth.users

-- Auto-insert any auth.users that don't have a profile
INSERT INTO public.profiles (id, display_name, email, role)
SELECT
  u.id,
  coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1)),
  u.email,
  'student'::public.user_role
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- RPC to inspect user status
CREATE OR REPLACE FUNCTION public.check_user_status(check_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user auth.users%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM auth.users WHERE lower(email) = lower(trim(check_email));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found_in_auth', false, 'email', check_email);
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user.id;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, display_name, email, role)
    VALUES (
      v_user.id,
      coalesce(v_user.raw_user_meta_data ->> 'display_name', split_part(v_user.email, '@', 1)),
      v_user.email,
      'student'::public.user_role
    )
    RETURNING * INTO v_profile;
  END IF;

  RETURN jsonb_build_object(
    'found_in_auth', true,
    'user_id', v_user.id,
    'email', v_user.email,
    'role', v_profile.role,
    'display_name', v_profile.display_name,
    'created_at', v_user.created_at
  );
END;
$$;
