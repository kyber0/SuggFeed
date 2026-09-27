-- Add staff write policies for comment moderation.
-- The add-comment Edge Function (service role) handles inserts;
-- these policies allow moderators/admins to hide, unhide, and delete comments
-- directly via the authenticated client from the staff portal.

alter table public.comments add column if not exists report_count integer not null default 0;
alter table public.comments add column if not exists is_hidden boolean not null default false;

create policy "staff moderates comments"
  on public.comments for update
  using (public.is_staff())
  with check (public.is_staff());

create policy "staff deletes comments"
  on public.comments for delete
  using (public.is_staff());
