-- Chỉ dùng trên database mới, sau đó chạy migration trong supabase/migrations ngay.
-- File này vẫn tạo các bảng nền; migration áp dụng RLS/auth/audit hoàn chỉnh.

create table if not exists public.groups (
  id         uuid primary key,
  name       text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  transfer_bank_name text check (transfer_bank_name is null or char_length(transfer_bank_name) <= 80),
  transfer_account_number text check (transfer_account_number is null or char_length(transfer_account_number) <= 40),
  transfer_account_holder text check (transfer_account_holder is null or char_length(transfer_account_holder) <= 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  account_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_participants (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text,
  email        text,
  joined_at    timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.group_chat_messages (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete restrict,
  sender_name text not null,
  message     text not null check (char_length(message) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  description  text not null check (char_length(description) between 1 and 120),
  amount       bigint not null check (amount > 0),
  paid_by      uuid not null references public.members(id) on delete restrict,
  participants uuid[] not null default '{}',
  created_at   timestamptz not null default now()
);

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  from_member uuid not null references public.members(id) on delete restrict,
  to_member   uuid not null references public.members(id) on delete restrict,
  amount      bigint not null check (amount > 0),
  created_at  timestamptz not null default now()
);

create index if not exists members_group_idx  on public.members(group_id);
create unique index if not exists members_group_account_idx
  on public.members(group_id, account_id)
  where account_id is not null;
create index if not exists group_participants_group_joined_idx
  on public.group_participants(group_id, joined_at);
create index if not exists group_chat_messages_group_created_idx
  on public.group_chat_messages(group_id, created_at desc, id desc);
create index if not exists expenses_group_idx on public.expenses(group_id);
create index if not exists payments_group_idx on public.payments(group_id);

-- Đọc group id từ header của request
create or replace function public.current_group_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-group-id', '')::uuid
$$;

alter table public.groups   enable row level security;
alter table public.members  enable row level security;
alter table public.expenses enable row level security;
alter table public.payments enable row level security;
alter table public.group_chat_messages enable row level security;

drop policy if exists "group by header" on public.groups;
create policy "group by header" on public.groups
  for all to anon, authenticated
  using (id = public.current_group_id())
  with check (id = public.current_group_id());

grant insert (id, name, description, created_by) on public.groups to authenticated;

drop policy if exists "members by header" on public.members;
create policy "members by header" on public.members
  for all to anon, authenticated
  using (group_id = public.current_group_id())
  with check (group_id = public.current_group_id());

drop policy if exists "expenses by header" on public.expenses;
create policy "expenses by header" on public.expenses
  for all to anon, authenticated
  using (group_id = public.current_group_id())
  with check (group_id = public.current_group_id());

drop policy if exists "payments by header" on public.payments;
create policy "payments by header" on public.payments
  for all to anon, authenticated
  using (group_id = public.current_group_id())
  with check (group_id = public.current_group_id());

drop policy if exists "group chat messages can be read by group link" on public.group_chat_messages;
create policy "group chat messages can be read by group link" on public.group_chat_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.group_participants
      where group_participants.group_id = group_chat_messages.group_id
        and group_participants.user_id = auth.uid()
    )
  );

drop policy if exists "authenticated users can send group chat messages" on public.group_chat_messages;
create policy "authenticated users can send group chat messages" on public.group_chat_messages
  for insert to authenticated
with check (
  group_id = public.current_group_id()
  and user_id = auth.uid()
  and exists (
    select 1 from public.group_participants
    where group_participants.group_id = group_chat_messages.group_id
      and group_participants.user_id = auth.uid()
  )
);

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

grant select, insert, update, delete on public.groups, public.members, public.expenses, public.payments
  to anon, authenticated;
revoke all on public.group_chat_messages from public, anon, authenticated;
grant select, insert (group_id, user_id, message) on public.group_chat_messages to authenticated;
grant usage, select on sequence public.group_chat_messages_id_seq to authenticated;
revoke all on function public.set_group_chat_sender() from public, anon, authenticated;
