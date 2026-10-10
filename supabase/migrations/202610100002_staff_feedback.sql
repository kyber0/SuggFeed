-- Moderation updates and their history must commit together.
alter table public.submissions add column if not exists staff_note text;

create or replace function public.moderate_submission(
  p_submission_id uuid, p_staff_id uuid, p_status text, p_note text default null
) returns void language plpgsql security definer set search_path = public
as $$
declare previous_status public.submission_status;
begin
  if not exists (select 1 from public.profiles where id = p_staff_id and role::text in ('admin', 'moderator', 'staff')) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved', 'rejected', 'in_progress', 'resolved') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 2000 then
    raise exception 'Note too long' using errcode = '22023';
  end if;
  select status into previous_status from public.submissions where id = p_submission_id for update;
  if not found then raise exception 'Submission not found' using errcode = 'P0002'; end if;
  update public.submissions set
    status = p_status::public.submission_status,
    staff_note = coalesce(nullif(trim(p_note), ''), staff_note),
    reviewed_by = p_staff_id, reviewed_at = now(), updated_at = now()
  where id = p_submission_id;
  insert into public.status_history (submission_id, old_status, new_status, changed_by, note)
  values (p_submission_id, previous_status, p_status::public.submission_status, p_staff_id, nullif(trim(p_note), ''));
end;
$$;
revoke all on function public.moderate_submission(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.moderate_submission(uuid, uuid, text, text) to service_role;
