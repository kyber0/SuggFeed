-- Auth profile provisioning and role helpers
alter table public.profiles add column if not exists email_notifications_enabled boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
create or replace function public.prevent_unauthorized_profile_role_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an admin can change a profile role';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles for each row execute procedure public.prevent_unauthorized_profile_role_change();
drop trigger if exists submissions_touch_updated_at on public.submissions;
create trigger submissions_touch_updated_at before update on public.submissions for each row execute procedure public.touch_updated_at();

-- Storage is private. Only service-role Edge Functions create/read objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submission-attachments', 'submission-attachments', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Replace broad/incomplete policies with least-privilege policies.
drop policy if exists "categories readable" on public.categories;
drop policy if exists "public may read approved submissions" on public.submissions;
drop policy if exists "owners read their history" on public.status_history;
drop policy if exists "staff audit access" on public.audit_log;

create policy "profile owner reads own profile" on public.profiles for select using (id = auth.uid());
create policy "staff reads profiles" on public.profiles for select using (public.is_staff());
create policy "profile owner updates safe fields" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "admins update profiles" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
create policy "admins manage categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy "everyone reads active categories" on public.categories for select using (is_active or public.is_staff());
create policy "public reads published submissions" on public.submissions for select using (status in ('approved','in_progress','resolved'));
create policy "owner reads own submissions" on public.submissions for select using (user_id = auth.uid());
create policy "staff reads all submissions" on public.submissions for select using (public.is_staff());
create policy "owner reads submission history" on public.status_history for select using (exists (select 1 from public.submissions s where s.id = submission_id and s.user_id = auth.uid()));
create policy "staff reads submission history" on public.status_history for select using (public.is_staff());
create policy "admins read audit log" on public.audit_log for select using (public.is_admin());

-- Voting is handled by an Edge Function; no browser INSERT/UPDATE/DELETE policies are granted.
create policy "published vote totals visible" on public.votes for select using (exists (select 1 from public.submissions s where s.id = submission_id and s.status in ('approved','in_progress','resolved')));
create or replace function public.refresh_submission_vote_count() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.submissions set vote_count = (select count(*) from public.votes where submission_id = coalesce(new.submission_id, old.submission_id))
  where id = coalesce(new.submission_id, old.submission_id);
  return coalesce(new, old);
end;
$$;
drop trigger if exists votes_refresh_submission_count on public.votes;
create trigger votes_refresh_submission_count after insert or delete on public.votes for each row execute procedure public.refresh_submission_vote_count();

create table if not exists public.retention_settings (
  id boolean primary key default true check (id),
  retention_days integer not null default 365 check (retention_days between 30 and 3650),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
alter table public.retention_settings enable row level security;
create policy "admins manage retention settings" on public.retention_settings for all using (public.is_admin()) with check (public.is_admin());
insert into public.retention_settings (id) values (true) on conflict (id) do nothing;

-- Service-side moderation functions validate state changes, but this constraint blocks accidental no-op history rows.
alter table public.status_history add constraint status_history_changes_status check (old_status is null or old_status <> new_status) not valid;
