create or replace function public.can_edit_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      public.is_system_admin()
      or exists (
        select 1
        from public.group_participants
        where group_participants.group_id = p_group_id
          and group_participants.user_id = auth.uid()
      )
    )
$$;

revoke all on function public.can_edit_group(uuid) from public, anon;
grant execute on function public.can_edit_group(uuid) to authenticated;
alter function public.can_edit_group(uuid) set search_path = '';

create or replace function public.require_group_participation_to_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
begin
  if tg_table_name = 'groups' then
    if tg_op = 'INSERT' then
      return new;
    end if;

    if tg_op = 'UPDATE'
      and old.created_by is null
      and new.created_by = auth.uid()
      and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by') then
      return new;
    end if;
    target_group_id := old.id;
  elsif tg_op = 'DELETE' then
    target_group_id := old.group_id;
  else
    target_group_id := new.group_id;
  end if;

  if not public.can_edit_group(target_group_id) then
    raise exception 'Hãy tham gia nhóm trước khi chỉnh sửa dữ liệu.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function public.require_group_participation_to_edit() from public, anon, authenticated;

drop trigger if exists require_group_participation_to_edit on public.groups;
create trigger require_group_participation_to_edit
  before update or delete on public.groups
  for each row execute function public.require_group_participation_to_edit();

drop trigger if exists require_group_participation_to_edit on public.members;
create trigger require_group_participation_to_edit
  before insert or update or delete on public.members
  for each row execute function public.require_group_participation_to_edit();

drop trigger if exists require_group_participation_to_edit on public.expenses;
create trigger require_group_participation_to_edit
  before insert or update or delete on public.expenses
  for each row execute function public.require_group_participation_to_edit();

drop trigger if exists require_group_participation_to_edit on public.payments;
create trigger require_group_participation_to_edit
  before insert or update or delete on public.payments
  for each row execute function public.require_group_participation_to_edit();

drop policy if exists "groups can be updated by group or admin" on public.groups;
create policy "groups can be updated by group participant or admin"
  on public.groups
  for update to authenticated
  using (
    (id = public.current_group_id() and public.can_edit_group(id))
    or public.is_system_admin()
  )
  with check (
    (id = public.current_group_id() and public.can_edit_group(id))
    or public.is_system_admin()
  );

drop policy if exists "members can be managed by group or admin" on public.members;
create policy "members can be read by group link or admin"
  on public.members
  for select to authenticated
  using (group_id = public.current_group_id() or public.is_system_admin());
create policy "members can be managed by group participant or admin"
  on public.members
  for all to authenticated
  using (
    (group_id = public.current_group_id() and public.can_edit_group(group_id))
    or public.is_system_admin()
  )
  with check (
    (group_id = public.current_group_id() and public.can_edit_group(group_id))
    or public.is_system_admin()
  );

drop policy if exists "expenses can be managed by group or admin" on public.expenses;
create policy "expenses can be read by group link or admin"
  on public.expenses
  for select to authenticated
  using (group_id = public.current_group_id() or public.is_system_admin());
create policy "expenses can be managed by group participant or admin"
  on public.expenses
  for all to authenticated
  using (
    (group_id = public.current_group_id() and public.can_edit_group(group_id))
    or public.is_system_admin()
  )
  with check (
    (group_id = public.current_group_id() and public.can_edit_group(group_id))
    or public.is_system_admin()
  );

drop policy if exists "payments can be managed by group or admin" on public.payments;
create policy "payments can be read by group link or admin"
  on public.payments
  for select to authenticated
  using (group_id = public.current_group_id() or public.is_system_admin());
create policy "payments can be managed by group participant or admin"
  on public.payments
  for all to authenticated
  using (
    (group_id = public.current_group_id() and public.can_edit_group(group_id))
    or public.is_system_admin()
  )
  with check (
    (group_id = public.current_group_id() and public.can_edit_group(group_id))
    or public.is_system_admin()
  );

create or replace function public.remove_group_participant(
  p_group_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  member_uuid uuid;
  member_is_referenced boolean;
begin
  if auth.uid() is null then
    raise exception 'Cần đăng nhập để xoá người tham gia.';
  end if;
  if public.current_group_id() is distinct from p_group_id then
    raise exception 'Link nhóm không hợp lệ.';
  end if;
  if not public.can_edit_group(p_group_id) then
    raise exception 'Hãy tham gia nhóm trước khi chỉnh sửa dữ liệu.';
  end if;

  select created_by into owner_id
  from public.groups
  where id = p_group_id
  for update;
  if not found then
    raise exception 'Không tìm thấy nhóm.';
  end if;
  if owner_id is distinct from auth.uid() and not public.is_system_admin() then
    raise exception 'Chỉ người tạo nhóm mới được xoá người tham gia.';
  end if;
  if p_user_id = owner_id then
    raise exception 'Không thể xoá chủ nhóm khỏi nhóm.';
  end if;

  delete from public.group_participants
  where group_id = p_group_id and user_id = p_user_id;
  if not found then
    raise exception 'Tài khoản này không còn trong danh sách tham gia.';
  end if;

  select id into member_uuid
  from public.members
  where group_id = p_group_id and account_id = p_user_id
  for update;
  if not found then
    return;
  end if;

  select
    exists (
      select 1 from public.expenses
      where group_id = p_group_id
        and (paid_by = member_uuid or member_uuid = any(participants))
    )
    or exists (
      select 1 from public.payments
      where group_id = p_group_id
        and (from_member = member_uuid or to_member = member_uuid)
    )
  into member_is_referenced;

  if not member_is_referenced then
    delete from public.members where id = member_uuid;
  end if;
end
$$;

revoke all on function public.remove_group_participant(uuid, uuid) from public, anon;
grant execute on function public.remove_group_participant(uuid, uuid) to authenticated;
alter function public.remove_group_participant(uuid, uuid) set search_path = '';

create or replace function public.claim_group_ownership(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.current_group_id() is distinct from p_group_id then
    raise exception 'Không có quyền nhận quyền sở hữu nhóm.';
  end if;

  update public.groups
  set created_by = auth.uid()
  where id = p_group_id and created_by is null;

  return found;
end
$$;

revoke all on function public.claim_group_ownership(uuid) from public, anon;
grant execute on function public.claim_group_ownership(uuid) to authenticated;
alter function public.claim_group_ownership(uuid) set search_path = '';
