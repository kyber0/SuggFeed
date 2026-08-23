-- ── Comments ─────────────────────────────────────────────────────────────────
-- Allows community members to comment on publicly visible submissions.
-- Writes are performed exclusively by the add-comment Edge Function (service role),
-- so no client INSERT/UPDATE/DELETE policies are granted.

create table public.comments (
  id             uuid        primary key default gen_random_uuid(),
  submission_id  uuid        not null references public.submissions(id) on delete cascade,
  body           text        not null check (char_length(body) between 10 and 500),
  display_name   text,       -- null = "Anonymous"
  anon_token     text,       -- stable per-browser UUID for non-signed-in users
  user_id        uuid        references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (anon_token is not null or user_id is not null)
);

alter table public.comments enable row level security;

-- Anyone can read comments on publicly visible submissions
create policy "public reads comments on published submissions"
  on public.comments for select
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.status in ('approved', 'in_progress', 'resolved')
    )
  );

-- Staff can read all comments (for moderation)
create policy "staff reads all comments"
  on public.comments for select
  using (public.is_staff());

-- Index for fast per-submission comment fetches
create index comments_submission_created on public.comments (submission_id, created_at);
