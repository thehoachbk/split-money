alter table public.groups
  add column if not exists description text
  check (description is null or char_length(description) <= 500);

grant insert (id, name, description, created_by) on public.groups to authenticated;
revoke update on public.groups from authenticated;

create or replace function public.update_group_description(
  p_group_id uuid,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  normalized_description text := nullif(btrim(p_description), '');
begin
  if auth.uid() is null then
    raise exception 'Cần đăng nhập để cập nhật mô tả nhóm.';
  end if;
  if public.current_group_id() is distinct from p_group_id then
    raise exception 'Link nhóm không hợp lệ.';
  end if;
  if normalized_description is not null and char_length(normalized_description) > 500 then
    raise exception 'Mô tả nhóm không được dài quá 500 ký tự.';
  end if;

  select created_by into owner_id from public.groups where id = p_group_id for update;
  if not found then
    raise exception 'Không tìm thấy nhóm.';
  end if;
  if owner_id is distinct from auth.uid() and not public.is_system_admin() then
    raise exception 'Chỉ người tạo nhóm mới được sửa mô tả.';
  end if;

  update public.groups
  set description = normalized_description
  where id = p_group_id;
end
$$;

revoke all on function public.update_group_description(uuid, text) from public, anon;
grant execute on function public.update_group_description(uuid, text) to authenticated;
alter function public.update_group_description(uuid, text) set search_path = '';
