-- Chỉ dùng trên database mới, sau đó chạy migration trong supabase/migrations ngay.
-- File này vẫn tạo các bảng nền; migration áp dụng RLS/auth/audit hoàn chỉnh.

create table if not exists public.groups (
  id         uuid primary key,
  name       text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
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

drop policy if exists "group by header" on public.groups;
create policy "group by header" on public.groups
  for all to anon, authenticated
  using (id = public.current_group_id())
  with check (id = public.current_group_id());

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

grant select, insert, update, delete on public.groups, public.members, public.expenses, public.payments
  to anon, authenticated;
