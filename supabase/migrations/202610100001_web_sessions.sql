-- Shared, encrypted Express sessions for serverless deployments.
create table if not exists public.web_sessions (
  id text primary key,
  payload text not null,
  expires_at timestamptz not null
);
create index if not exists web_sessions_expires_at_idx on public.web_sessions(expires_at);
alter table public.web_sessions enable row level security;
revoke all on public.web_sessions from anon, authenticated;
grant select, insert, update, delete on public.web_sessions to service_role;
comment on table public.web_sessions is 'Server-only encrypted sessions. Delete expired rows daily; SESSION_SECRET encrypts payloads.';
