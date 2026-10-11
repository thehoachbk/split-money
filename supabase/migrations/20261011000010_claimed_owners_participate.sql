create or replace function public.claim_group_ownership(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := auth.jwt();
  metadata jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
  owner_id uuid;
  nickname text;
begin
  if auth.uid() is null or public.current_group_id() is distinct from p_group_id then
    raise exception 'Không có quyền nhận quyền sở hữu nhóm.';
  end if;

  select created_by into owner_id
  from public.groups
  where id = p_group_id
  for update;
  if not found then
    raise exception 'Không tìm thấy nhóm.';
  end if;
  if owner_id is not null then
    return false;
  end if;

  nickname := left(
    coalesce(
      nullif(btrim(metadata ->> 'full_name'), ''),
      nullif(btrim(metadata ->> 'name'), ''),
      nullif(split_part(claims ->> 'email', '@', 1), ''),
      'Thành viên'
    ),
    40
  );

  insert into public.group_participants (group_id, user_id, display_name, email)
  values (p_group_id, auth.uid(), nickname, claims ->> 'email')
  on conflict (group_id, user_id) do nothing;

  insert into public.members (group_id, name, account_id)
  values (p_group_id, nickname, auth.uid())
  on conflict (group_id, account_id) where account_id is not null do nothing;

  update public.groups
  set created_by = auth.uid()
  where id = p_group_id and created_by is null;

  return found;
end
$$;

revoke all on function public.claim_group_ownership(uuid) from public, anon;
grant execute on function public.claim_group_ownership(uuid) to authenticated;
alter function public.claim_group_ownership(uuid) set search_path = '';

create or replace function public.set_group_member_nickname(
  p_group_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  nickname text := btrim(p_name);
begin
  if auth.uid() is null then
    raise exception 'Cần đăng nhập để đổi nickname.';
  end if;
  if public.current_group_id() is distinct from p_group_id then
    raise exception 'Link nhóm không hợp lệ.';
  end if;
  if not public.can_edit_group(p_group_id) then
    raise exception 'Hãy tham gia nhóm trước khi chỉnh sửa dữ liệu.';
  end if;
  if char_length(nickname) not between 1 and 40 then
    raise exception 'Nickname phải có từ 1 đến 40 ký tự.';
  end if;

  update public.members
  set name = nickname
  where group_id = p_group_id and account_id = auth.uid();
  if not found then
    raise exception 'Bạn chưa tham gia nhóm.';
  end if;
end
$$;

revoke all on function public.set_group_member_nickname(uuid, text) from public, anon;
grant execute on function public.set_group_member_nickname(uuid, text) to authenticated;
alter function public.set_group_member_nickname(uuid, text) set search_path = '';
