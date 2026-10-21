create table if not exists public.group_chat_messages (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete restrict,
  sender_name text not null,
  message     text not null check (char_length(message) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index if not exists group_chat_messages_group_created_idx
  on public.group_chat_messages(group_id, created_at desc, id desc);

create or replace function public.set_group_chat_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'Không thể gửi tin nhắn dưới tài khoản khác.';
  end if;

  new.sender_name := coalesce(
    (
      select members.name
      from public.members
      where members.group_id = new.group_id
        and members.account_id = auth.uid()
    ),
    nullif(btrim(metadata ->> 'full_name'), ''),
    nullif(btrim(metadata ->> 'name'), ''),
    nullif(split_part(auth.jwt() ->> 'email', '@', 1), ''),
    'Thành viên'
  );
  return new;
end
$$;

drop trigger if exists set_group_chat_sender on public.group_chat_messages;
create trigger set_group_chat_sender
  before insert on public.group_chat_messages
  for each row execute function public.set_group_chat_sender();

alter table public.group_chat_messages enable row level security;

drop policy if exists "group participants can be read by self, group owner, or admin" on public.group_participants;
create policy "group participants can be read by self, group owner, or admin"
  on public.group_participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      group_id = public.current_group_id()
      and exists (
        select 1 from public.groups
        where groups.id = group_participants.group_id
          and groups.created_by = auth.uid()
      )
    )
    or public.is_system_admin()
  );

drop policy if exists "group chat messages can be read by group link" on public.group_chat_messages;
create policy "group chat messages can be read by group link"
  on public.group_chat_messages
  for select to authenticated
  using (
    public.is_system_admin()
    or exists (
      select 1 from public.group_participants
      where group_participants.group_id = group_chat_messages.group_id
        and group_participants.user_id = auth.uid()
    )
  );

drop policy if exists "authenticated users can send group chat messages" on public.group_chat_messages;
create policy "authenticated users can send group chat messages"
  on public.group_chat_messages
  for insert to authenticated
  with check (
    group_id = public.current_group_id()
    and user_id = auth.uid()
    and char_length(btrim(message)) between 1 and 1000
    and exists (
      select 1 from public.group_participants
      where group_participants.group_id = group_chat_messages.group_id
        and group_participants.user_id = auth.uid()
    )
  );

revoke all on public.group_chat_messages from public, anon, authenticated;
grant select, insert (group_id, user_id, message) on public.group_chat_messages to authenticated;
grant select, insert, update, delete on public.group_chat_messages to service_role;
grant usage, select on sequence public.group_chat_messages_id_seq to authenticated;
grant usage, select on sequence public.group_chat_messages_id_seq to service_role;

revoke all on function public.set_group_chat_sender() from public, anon, authenticated;
alter function public.set_group_chat_sender() set search_path = '';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'group_chat_messages'
    ) then
    execute 'alter publication supabase_realtime add table public.group_chat_messages';
  end if;
end
$$;
