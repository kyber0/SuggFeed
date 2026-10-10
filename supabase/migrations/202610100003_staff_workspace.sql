-- Private operational data must never be joined into public submission responses.
create table public.submission_workflow (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  assignee_id uuid references public.profiles(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  target_date date,
  updated_at timestamptz not null default now()
);
create index submission_workflow_assignee_idx on public.submission_workflow(assignee_id);
create index submission_workflow_target_idx on public.submission_workflow(target_date) where target_date is not null;
create table public.staff_internal_notes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index staff_notes_submission_idx on public.staff_internal_notes(submission_id,created_at);
create table public.staff_workflow_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  previous jsonb not null,
  current jsonb not null,
  created_at timestamptz not null default now()
);
create index staff_workflow_history_submission_idx on public.staff_workflow_history(submission_id,created_at);
create table public.staff_saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  filters jsonb not null check (jsonb_typeof(filters) = 'object'),
  created_at timestamptz not null default now(),
  unique(owner_id,name)
);
alter table public.submission_workflow enable row level security;
alter table public.staff_internal_notes enable row level security;
alter table public.staff_workflow_history enable row level security;
alter table public.staff_saved_views enable row level security;
-- No browser grants or RLS policies: access is through authenticated server routes only.
revoke all on public.submission_workflow,public.staff_internal_notes,public.staff_workflow_history,public.staff_saved_views from public,anon,authenticated;
grant all on public.submission_workflow,public.staff_internal_notes,public.staff_workflow_history,public.staff_saved_views to service_role;

-- Server-only view: filters and exact counts run before pagination.
create view public.staff_submission_queue as
select s.id,s.title,s.description,s.status,s.vote_count,s.comment_count,
  s.created_at,s.updated_at,s.staff_note,
  jsonb_build_object('name',c.name) as categories,
  w.assignee_id,coalesce(w.priority,'normal') as priority,w.target_date,
  a.display_name as assignee_name
from public.submissions s
join public.categories c on c.id=s.category_id
left join public.submission_workflow w on w.submission_id=s.id
left join public.profiles a on a.id=w.assignee_id;
revoke all on public.staff_submission_queue from public,anon,authenticated;
grant select on public.staff_submission_queue to service_role;

create function public.save_staff_review(
 p_submission_id uuid,p_staff_id uuid,p_expected_updated_at timestamptz,
 p_status text,p_note text,p_assignee_id uuid,p_priority text,p_target_date date
) returns void language plpgsql security definer set search_path=public as $$
declare s public.submissions%rowtype; w public.submission_workflow%rowtype;
begin
 if not exists(select 1 from public.profiles where id=p_staff_id and role::text in ('admin','moderator','staff')) then
  raise exception 'Staff access required' using errcode='42501';
 end if;
 if p_status is null or p_status not in ('pending','approved','in_progress','resolved','rejected')
  or p_priority is null or p_priority not in ('low','normal','high','urgent')
  or p_note is null or char_length(p_note)>2000 then
  raise exception 'Invalid review' using errcode='22023';
 end if;
 if p_assignee_id is not null and not exists(select 1 from public.profiles where id=p_assignee_id and role::text in ('admin','moderator','staff')) then
  raise exception 'Assignee must be staff' using errcode='22023';
 end if;
 select * into s from public.submissions where id=p_submission_id for update;
 if not found then raise exception 'Not found' using errcode='P0002'; end if;
 if p_expected_updated_at is null or s.updated_at<>p_expected_updated_at then
  raise exception 'Review has changed' using errcode='40001';
 end if;
 select * into w from public.submission_workflow where submission_id=p_submission_id;
 insert into public.staff_workflow_history(submission_id,actor_id,previous,current) values(
  p_submission_id,p_staff_id,
  jsonb_build_object('status',s.status,'assignee_id',w.assignee_id,'priority',coalesce(w.priority,'normal'),'target_date',w.target_date,'response',s.staff_note),
  jsonb_build_object('status',p_status,'assignee_id',p_assignee_id,'priority',p_priority,'target_date',p_target_date,'response',nullif(trim(p_note),''))
 );
 insert into public.submission_workflow(submission_id,assignee_id,priority,target_date)
  values(p_submission_id,p_assignee_id,p_priority,p_target_date)
  on conflict(submission_id) do update set assignee_id=excluded.assignee_id,
   priority=excluded.priority,target_date=excluded.target_date,updated_at=now();
 update public.submissions set status=p_status::public.submission_status,staff_note=nullif(trim(p_note),''),
  reviewed_by=p_staff_id,reviewed_at=now(),updated_at=clock_timestamp() where id=p_submission_id;
 -- The existing history constraint allows only genuine status transitions.
 if s.status::text<>p_status then
  insert into public.status_history(submission_id,old_status,new_status,changed_by,note)
   values(p_submission_id,s.status,p_status::public.submission_status,p_staff_id,nullif(trim(p_note),''));
 end if;
end; $$;
revoke all on function public.save_staff_review(uuid,uuid,timestamptz,text,text,uuid,text,date) from public,anon,authenticated;
grant execute on function public.save_staff_review(uuid,uuid,timestamptz,text,text,uuid,text,date) to service_role;

-- Serialize the per-user limit so parallel requests cannot exceed ten saved views.
create function public.save_staff_view(p_staff_id uuid,p_name text,p_filters jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare saved_id uuid;
begin
 perform 1 from public.profiles where id=p_staff_id and role::text in ('admin','moderator','staff') for update;
 if not found then raise exception 'Staff access required' using errcode='42501'; end if;
 if (select count(*) from public.staff_saved_views where owner_id=p_staff_id)>=10 then
  raise exception 'Saved view limit reached' using errcode='22023';
 end if;
 insert into public.staff_saved_views(owner_id,name,filters) values(p_staff_id,trim(p_name),p_filters) returning id into saved_id;
 return saved_id;
end; $$;
revoke all on function public.save_staff_view(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_staff_view(uuid,text,jsonb) to service_role;
