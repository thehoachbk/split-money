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
