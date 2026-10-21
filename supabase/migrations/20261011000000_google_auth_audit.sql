-- Upgrade the existing link-only schema to Google-authenticated access and audit history.
-- Existing groups have no provable creator; the first authenticated link holder may claim them.

alter table public.groups
  add column if not exists created_by uuid references auth.users(id) on delete restrict;

create table if not exists public.group_audit_log (
  id          bigint generated always as identity primary key,
  group_id    uuid not null,
  table_name  text not null,
  operation   text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  record_id   uuid not null,
  actor_id    uuid,
  actor_name  text not null,
  actor_email text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists group_audit_log_group_created_idx
  on public.group_audit_log(group_id, created_at desc);

create or replace function public.current_group_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-group-id', '')::uuid
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'thehoach92@gmail.com'
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google'
$$;

create or replace function public.log_group_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  group_uuid uuid;
  record_uuid uuid;
  actor_metadata jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  group_uuid := case
    when tg_table_name = 'groups' then (row_data ->> 'id')::uuid
    else (row_data ->> 'group_id')::uuid
  end;
  record_uuid := (row_data ->> 'id')::uuid;
  actor_metadata := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);

  insert into public.group_audit_log (
    group_id, table_name, operation, record_id, actor_id, actor_name, actor_email, old_data, new_data
  ) values (
    group_uuid,
    tg_table_name,
    tg_op,
    record_uuid,
    auth.uid(),
    coalesce(
      nullif(actor_metadata ->> 'full_name', ''),
      nullif(actor_metadata ->> 'name', ''),
      nullif(auth.jwt() ->> 'email', ''),
      'Người dùng'
    ),
    auth.jwt() ->> 'email',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create or replace function public.handle_group_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Sự kiện audit được ghi tự động và không thể sửa hoặc xoá.';
end
$$;

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

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Cần đăng nhập để xoá nhóm.';
  end if;

  if public.current_group_id() is distinct from p_group_id and not public.is_system_admin() then
    raise exception 'Không có quyền truy cập nhóm.';
  end if;

  select created_by into owner_id
  from public.groups
  where id = p_group_id
  for update;

  if not found then
    raise exception 'Không tìm thấy nhóm.';
  end if;
  if owner_id is distinct from auth.uid() and not public.is_system_admin() then
    raise exception 'Chỉ người tạo nhóm mới được xoá nhóm.';
  end if;

  delete from public.payments where group_id = p_group_id;
  delete from public.expenses where group_id = p_group_id;
  delete from public.members where group_id = p_group_id;
  delete from public.groups where id = p_group_id;
end
$$;

alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.expenses enable row level security;
alter table public.payments enable row level security;
alter table public.group_audit_log enable row level security;

drop policy if exists "group by header" on public.groups;
drop policy if exists "groups can be read by group or admin" on public.groups;
drop policy if exists "groups can be created by signed-in users" on public.groups;
drop policy if exists "groups can be updated by group or admin" on public.groups;
create policy "groups can be read by group or admin" on public.groups
  for select to authenticated
  using (id = public.current_group_id() or public.is_system_admin());
create policy "groups can be created by signed-in users" on public.groups
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (id = public.current_group_id() or public.is_system_admin())
  );
create policy "groups can be updated by group or admin" on public.groups
  for update to authenticated
  using (id = public.current_group_id() or public.is_system_admin())
  with check (id = public.current_group_id() or public.is_system_admin());

drop policy if exists "members by header" on public.members;
drop policy if exists "members can be managed by group or admin" on public.members;
create policy "members can be managed by group or admin" on public.members
  for all to authenticated
  using (group_id = public.current_group_id() or public.is_system_admin())
  with check (group_id = public.current_group_id() or public.is_system_admin());

drop policy if exists "expenses by header" on public.expenses;
drop policy if exists "expenses can be managed by group or admin" on public.expenses;
create policy "expenses can be managed by group or admin" on public.expenses
  for all to authenticated
  using (group_id = public.current_group_id() or public.is_system_admin())
  with check (group_id = public.current_group_id() or public.is_system_admin());

drop policy if exists "payments by header" on public.payments;
drop policy if exists "payments can be managed by group or admin" on public.payments;
create policy "payments can be managed by group or admin" on public.payments
  for all to authenticated
  using (group_id = public.current_group_id() or public.is_system_admin())
  with check (group_id = public.current_group_id() or public.is_system_admin());

drop policy if exists "audit log can be read by group or admin" on public.group_audit_log;
create policy "audit log can be read by group or admin" on public.group_audit_log
  for select to authenticated
  using (group_id = public.current_group_id() or public.is_system_admin());

drop trigger if exists audit_groups on public.groups;
create trigger audit_groups after insert or update or delete on public.groups
  for each row execute function public.log_group_change();
drop trigger if exists audit_members on public.members;
create trigger audit_members after insert or update or delete on public.members
  for each row execute function public.log_group_change();
drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function public.log_group_change();
drop trigger if exists audit_payments on public.payments;
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function public.log_group_change();

drop trigger if exists immutable_group_audit_log on public.group_audit_log;
create trigger immutable_group_audit_log before update or delete on public.group_audit_log
  for each row execute function public.handle_group_change();

revoke all on public.groups, public.members, public.expenses, public.payments, public.group_audit_log from public, anon;
revoke all on public.groups, public.group_audit_log from authenticated;
grant select, insert (id, name, created_by), update (name) on public.groups to authenticated;
grant select, insert, update, delete on public.members, public.expenses, public.payments to authenticated;
grant select on public.group_audit_log to authenticated;
grant select, insert, update, delete on public.groups, public.members, public.expenses, public.payments
  to service_role;
grant select on public.group_audit_log to service_role;
grant usage, select on sequence public.group_audit_log_id_seq to authenticated;

revoke all on function public.current_group_id() from public, anon;
grant execute on function public.current_group_id() to authenticated;
revoke all on function public.is_system_admin() from public, anon;
grant execute on function public.is_system_admin() to authenticated;
revoke all on function public.log_group_change() from public, anon, authenticated;
revoke all on function public.handle_group_change() from public, anon, authenticated;
revoke all on function public.claim_group_ownership(uuid) from public, anon;
grant execute on function public.claim_group_ownership(uuid) to authenticated;
revoke all on function public.delete_group(uuid) from public, anon;
grant execute on function public.delete_group(uuid) to authenticated;
