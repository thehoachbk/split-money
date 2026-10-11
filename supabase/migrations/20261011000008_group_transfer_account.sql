alter table public.groups
  add column if not exists transfer_bank_name text
    check (transfer_bank_name is null or char_length(transfer_bank_name) <= 80),
  add column if not exists transfer_account_number text
    check (transfer_account_number is null or char_length(transfer_account_number) <= 40),
  add column if not exists transfer_account_holder text
    check (transfer_account_holder is null or char_length(transfer_account_holder) <= 120);

create or replace function public.update_group_transfer_account(
  p_group_id uuid,
  p_bank_name text,
  p_account_number text,
  p_account_holder text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  normalized_bank text := nullif(btrim(p_bank_name), '');
  normalized_number text := nullif(btrim(p_account_number), '');
  normalized_holder text := nullif(btrim(p_account_holder), '');
begin
  if auth.uid() is null then
    raise exception 'Cần đăng nhập để cập nhật tài khoản nhận tiền.';
  end if;
  if public.current_group_id() is distinct from p_group_id then
    raise exception 'Link nhóm không hợp lệ.';
  end if;
  if (normalized_bank is null) <> (normalized_number is null)
    or (normalized_bank is null) <> (normalized_holder is null) then
    raise exception 'Hãy nhập đầy đủ ngân hàng, số tài khoản và tên chủ tài khoản; hoặc xoá cả ba để bỏ thông tin.';
  end if;
  if char_length(normalized_bank) > 80
    or char_length(normalized_number) > 40
    or char_length(normalized_holder) > 120 then
    raise exception 'Thông tin tài khoản vượt quá độ dài cho phép.';
  end if;

  select created_by into owner_id
  from public.groups
  where id = p_group_id
  for update;
  if not found then
    raise exception 'Không tìm thấy nhóm.';
  end if;
  if owner_id is distinct from auth.uid() and not public.is_system_admin() then
    raise exception 'Chỉ người tạo nhóm mới được sửa tài khoản nhận tiền.';
  end if;

  update public.groups
  set transfer_bank_name = normalized_bank,
      transfer_account_number = normalized_number,
      transfer_account_holder = normalized_holder
  where id = p_group_id;
end
$$;

revoke all on function public.update_group_transfer_account(uuid, text, text, text) from public, anon;
grant execute on function public.update_group_transfer_account(uuid, text, text, text) to authenticated;
alter function public.update_group_transfer_account(uuid, text, text, text) set search_path = '';
