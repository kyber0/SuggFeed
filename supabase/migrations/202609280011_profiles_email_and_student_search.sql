-- Migration: Add email column to profiles, sync from auth.users, and provide student email search RPC

-- 1. Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- 2. Backfill existing profile emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id;

-- 3. Update handle_new_user() to persist email on sign up
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  ON CONFLICT (id) DO UPDATE SET
    email = coalesce(EXCLUDED.email, public.profiles.email),
    display_name = coalesce(public.profiles.display_name, EXCLUDED.display_name);
  RETURN new;
END;
$$;

-- 4. Sync email updates from auth.users to public.profiles
CREATE OR REPLACE FUNCTION public.handle_user_email_updated() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF new.email IS DISTINCT FROM old.email THEN
    UPDATE public.profiles SET email = new.email, updated_at = now() WHERE id = new.id;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_user_email_updated();

-- 5. Create index for fast email searching
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (lower(email));

-- 6. RPC function for admins to search students by Gmail / email
CREATE OR REPLACE FUNCTION public.admin_search_students(search_email text DEFAULT '', result_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  display_name text,
  email text,
  role public.user_role,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller has staff or admin role
  IF NOT (public.is_admin() OR public.is_staff()) THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.email,
    p.role,
    p.created_at
  FROM public.profiles p
  WHERE p.role = 'student'
    AND (
      search_email IS NULL 
      OR trim(search_email) = ''
      OR p.email ILIKE ('%' || trim(search_email) || '%')
      OR p.display_name ILIKE ('%' || trim(search_email) || '%')
    )
  ORDER BY p.created_at DESC
  LIMIT result_limit;
END;
$$;
