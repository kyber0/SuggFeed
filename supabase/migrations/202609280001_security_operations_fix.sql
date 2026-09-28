-- Migration: Ensure security, operations, and profiles email_notifications_enabled are applied
-- Rationale: Migration 202608200002 was marked as applied in migration history, but its DDL
-- was never executed on the remote database. This migration idempotently applies the missing
-- columns, functions, triggers, and RLS policies.

-- Profiles columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Role helper functions
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN new.updated_at = now(); RETURN new; END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_profile_role_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF new.role IS DISTINCT FROM old.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can change a profile role';
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_role ON public.profiles;
CREATE TRIGGER profiles_protect_role BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.prevent_unauthorized_profile_role_change();

DROP TRIGGER IF EXISTS submissions_touch_updated_at ON public.submissions;
CREATE TRIGGER submissions_touch_updated_at BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE PROCEDURE public.touch_updated_at();

-- Profiles RLS policies
DROP POLICY IF EXISTS "profile owner reads own profile" ON public.profiles;
CREATE POLICY "profile owner reads own profile" ON public.profiles FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "staff reads profiles" ON public.profiles;
CREATE POLICY "staff reads profiles" ON public.profiles FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "profile owner updates safe fields" ON public.profiles;
CREATE POLICY "profile owner updates safe fields" ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "admins update profiles" ON public.profiles;
CREATE POLICY "admins update profiles" ON public.profiles FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Categories RLS
DROP POLICY IF EXISTS "categories readable" ON public.categories;
DROP POLICY IF EXISTS "everyone reads active categories" ON public.categories;
CREATE POLICY "everyone reads active categories" ON public.categories FOR SELECT USING (is_active OR public.is_staff());

DROP POLICY IF EXISTS "admins manage categories" ON public.categories;
CREATE POLICY "admins manage categories" ON public.categories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Submissions RLS
DROP POLICY IF EXISTS "public may read approved submissions" ON public.submissions;
DROP POLICY IF EXISTS "public reads published submissions" ON public.submissions;
CREATE POLICY "public reads published submissions" ON public.submissions FOR SELECT USING (status IN ('approved','in_progress','resolved'));

DROP POLICY IF EXISTS "owner reads own submissions" ON public.submissions;
CREATE POLICY "owner reads own submissions" ON public.submissions FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "staff reads all submissions" ON public.submissions;
CREATE POLICY "staff reads all submissions" ON public.submissions FOR SELECT USING (public.is_staff());

-- Status History RLS
DROP POLICY IF EXISTS "owners read their history" ON public.status_history;
DROP POLICY IF EXISTS "owner reads submission history" ON public.status_history;
CREATE POLICY "owner reads submission history" ON public.status_history FOR SELECT USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "staff reads submission history" ON public.status_history;
CREATE POLICY "staff reads submission history" ON public.status_history FOR SELECT USING (public.is_staff());

-- Audit Log RLS
DROP POLICY IF EXISTS "staff audit access" ON public.audit_log;
DROP POLICY IF EXISTS "admins read audit log" ON public.audit_log;
CREATE POLICY "admins read audit log" ON public.audit_log FOR SELECT USING (public.is_admin());

-- Votes RLS & triggers
DROP POLICY IF EXISTS "published vote totals visible" ON public.votes;
CREATE POLICY "published vote totals visible" ON public.votes FOR SELECT USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.status IN ('approved','in_progress','resolved')));

CREATE OR REPLACE FUNCTION public.refresh_submission_vote_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.submissions SET vote_count = (SELECT count(*) FROM public.votes WHERE submission_id = coalesce(new.submission_id, old.submission_id))
  WHERE id = coalesce(new.submission_id, old.submission_id);
  RETURN coalesce(new, old);
END;
$$;

DROP TRIGGER IF EXISTS votes_refresh_submission_count ON public.votes;
CREATE TRIGGER votes_refresh_submission_count AFTER INSERT OR DELETE ON public.votes FOR EACH ROW EXECUTE PROCEDURE public.refresh_submission_vote_count();

-- Retention settings
CREATE TABLE IF NOT EXISTS public.retention_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  retention_days integer NOT NULL DEFAULT 365 CHECK (retention_days BETWEEN 30 AND 3650),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);
ALTER TABLE public.retention_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage retention settings" ON public.retention_settings;
CREATE POLICY "admins manage retention settings" ON public.retention_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
INSERT INTO public.retention_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Status history constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'status_history_changes_status') THEN
    ALTER TABLE public.status_history ADD CONSTRAINT status_history_changes_status CHECK (old_status IS NULL OR old_status <> new_status) NOT VALID;
  END IF;
END $$;
