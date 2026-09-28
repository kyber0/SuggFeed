-- Allow direct SQL editor and service-role updates to profile roles.
-- When auth.uid() is NULL (e.g., Supabase SQL Editor, migrations, or service role),
-- the admin check is bypassed so administrators can bootstrap and manage roles directly.

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce role-protection when triggered by an authenticated end-user session.
  -- Direct SQL queries and service-role operations (where auth.uid() is NULL) are permitted.
  IF auth.uid() IS NOT NULL AND new.role IS DISTINCT FROM old.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can change a profile role';
  END IF;
  RETURN new;
END;
$$;
