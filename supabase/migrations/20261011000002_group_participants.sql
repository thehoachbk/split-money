create table if not exists public.group_participants (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text,
  email        text,
  joined_at    timestamptz not null default now(),
  unique (group_id, user_id)
);

alter table public.members
  add column if not exists account_id uuid references auth.users(id) on delete set null;

create unique index if not exists members_group_account_idx
  on public.members(group_id, account_id)
  where account_id is not null;

create index if not exists group_participants_group_joined_idx
  on public.group_participants(group_id, joined_at);

insert into public.group_participants (group_id, user_id, display_name, email)
select
  groups.id,
  users.id,
  coalesce(
    nullif(users.raw_user_meta_data ->> 'full_name', ''),
    nullif(users.raw_user_meta_data ->> 'name', '')
  ),
  users.email
from public.groups as groups
join auth.users as users on users.id = groups.created_by
on conflict (group_id, user_id) do nothing;

create or replace function public.register_group_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator auth.users%rowtype;
begin
  select * into creator from auth.users where id = new.created_by;

  insert into public.group_participants (group_id, user_id, display_name, email)
  values (
    new.id,
    new.created_by,
    coalesce(
      nullif(creator.raw_user_meta_data ->> 'full_name', ''),
      nullif(creator.raw_user_meta_data ->> 'name', '')
    ),
    creator.email
  )
  on conflict (group_id, user_id) do nothing;
  return new;
end
$$;

create trigger register_group_creator
  after insert on public.groups
  for each row execute function public.register_group_creator();

create or replace function public.join_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := auth.jwt();
  metadata jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
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

  insert into public.group_participants (group_id, user_id, display_name, email)
  values (
    p_group_id,
    auth.uid(),
    coalesce(nullif(metadata ->> 'full_name', ''), nullif(metadata ->> 'name', '')),
    claims ->> 'email'
  )
  on conflict (group_id, user_id) do nothing;
end
$$;

create or replace function public.assign_group_member_account(
  p_group_id uuid,
  p_member_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Cần đăng nhập để gán tài khoản.';
  end if;
  if public.current_group_id() is distinct from p_group_id then
    raise exception 'Link nhóm không hợp lệ.';
  end if;

  select created_by into owner_id from public.groups where id = p_group_id;
  if not found then
    raise exception 'Không tìm thấy nhóm.';
  end if;
  if owner_id is distinct from auth.uid() and not public.is_system_admin() then
    raise exception 'Chỉ người tạo nhóm mới được gán tài khoản.';
  end if;
  if p_user_id is not null and not exists (
    select 1 from public.group_participants
    where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'Tài khoản này chưa tham gia nhóm.';
  end if;
  if p_user_id is not null and exists (
    select 1 from public.members
    where group_id = p_group_id and id = p_member_id
      and account_id is not null and account_id <> p_user_id
  ) then
    raise exception 'Nickname này đã được gán cho tài khoản khác trong nhóm.';
  end if;

  update public.members
  set account_id = null
  where group_id = p_group_id and account_id = p_user_id;

  if p_member_id is null then
    return;
  end if;

  update public.members
  set account_id = p_user_id
  where group_id = p_group_id and id = p_member_id;
  if not found then
    raise exception 'Không tìm thấy nickname trong nhóm.';
  end if;
end
$$;

alter table public.group_participants enable row level security;

create policy "group participants can be read by self, group owner, or admin"
  on public.group_participants
  for select to authenticated
  using (
    group_id = public.current_group_id()
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.groups
        where groups.id = group_participants.group_id
          and (groups.created_by = auth.uid() or public.is_system_admin())
      )
    )
  );

drop trigger if exists audit_group_participants on public.group_participants;
create trigger audit_group_participants
  after insert or update or delete on public.group_participants
  for each row execute function public.log_group_change();

revoke all on public.group_participants from public, anon, authenticated;
grant select on public.group_participants to authenticated;
revoke update on public.members from authenticated;

revoke all on function public.register_group_creator() from public, anon, authenticated;
revoke all on function public.join_group(uuid) from public, anon;
grant execute on function public.join_group(uuid) to authenticated;
revoke all on function public.assign_group_member_account(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_group_member_account(uuid, uuid, uuid) to authenticated;
