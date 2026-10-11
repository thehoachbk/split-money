create or replace function public.join_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := auth.jwt();
  metadata jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
  nickname text;
begin
  if auth.uid() is null then
    raise exception 'Cần đăng nhập để tham gia nhóm.';
  end if;
  if public.current_group_id() is distinct from p_group_id then
    raise exception 'Link nhóm không hợp lệ.';
  end if;
  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'Không tìm thấy nhóm.';
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
  on conflict (group_id, user_id) do update
  set display_name = excluded.display_name,
      email = excluded.email;

  insert into public.members (group_id, name, account_id)
  values (p_group_id, nickname, auth.uid())
  on conflict (group_id, account_id) where account_id is not null do nothing;
end
$$;

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

create or replace function public.merge_group_temp_member(
  p_group_id uuid,
  p_temp_member_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  source_account_id uuid;
  source_name text;
  destination_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Cần đăng nhập để gộp thành viên.';
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
    raise exception 'Chỉ người tạo nhóm mới được gộp thành viên.';
  end if;
  if not exists (
    select 1 from public.group_participants
    where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'Tài khoản này chưa tham gia nhóm.';
  end if;

  select account_id, name into source_account_id, source_name
  from public.members
  where id = p_temp_member_id and group_id = p_group_id
  for update;
  if not found then
    raise exception 'Không tìm thấy thành viên tạm trong nhóm.';
  end if;
  if source_account_id is not null then
    raise exception 'Chỉ có thể gộp nickname chưa liên kết với tài khoản.';
  end if;

  select id into destination_member_id
  from public.members
  where group_id = p_group_id and account_id = p_user_id
  for update;
  if not found then
    raise exception 'Tài khoản chưa có thành viên chính trong nhóm.';
  end if;
  if destination_member_id = p_temp_member_id then
    raise exception 'Không thể gộp một thành viên vào chính nó.';
  end if;

  update public.members
  set name = source_name
  where id = destination_member_id;

  update public.expenses as expense
  set paid_by = case when expense.paid_by = p_temp_member_id then destination_member_id else expense.paid_by end,
      participants = (
        select coalesce(array_agg(mapped.member_id order by mapped.first_position), '{}'::uuid[])
        from (
          select
            case when participant.member_id = p_temp_member_id then destination_member_id else participant.member_id end as member_id,
            min(participant.position) as first_position
          from unnest(expense.participants) with ordinality as participant(member_id, position)
          group by case when participant.member_id = p_temp_member_id then destination_member_id else participant.member_id end
        ) as mapped
      )
  where expense.group_id = p_group_id
    and (
      expense.paid_by = p_temp_member_id
      or p_temp_member_id = any(expense.participants)
    );

  delete from public.payments
  where group_id = p_group_id
    and (
      (from_member = p_temp_member_id and to_member = destination_member_id)
      or (from_member = destination_member_id and to_member = p_temp_member_id)
    );

  update public.payments
  set from_member = case when from_member = p_temp_member_id then destination_member_id else from_member end,
      to_member = case when to_member = p_temp_member_id then destination_member_id else to_member end
  where group_id = p_group_id
    and (from_member = p_temp_member_id or to_member = p_temp_member_id);

  delete from public.members
  where id = p_temp_member_id and group_id = p_group_id;
end
$$;

revoke all on function public.assign_group_member_account(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_group_member_nickname(uuid, text) from public, anon;
grant execute on function public.set_group_member_nickname(uuid, text) to authenticated;
revoke all on function public.merge_group_temp_member(uuid, uuid, uuid) from public, anon;
grant execute on function public.merge_group_temp_member(uuid, uuid, uuid) to authenticated;

alter function public.join_group(uuid) set search_path = '';
alter function public.set_group_member_nickname(uuid, text) set search_path = '';
alter function public.merge_group_temp_member(uuid, uuid, uuid) set search_path = '';
