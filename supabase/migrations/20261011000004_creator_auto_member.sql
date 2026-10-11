create or replace function public.register_group_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator auth.users%rowtype;
  nickname text;
begin
  select * into creator from auth.users where id = new.created_by;
  nickname := left(
    coalesce(
      nullif(btrim(creator.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(creator.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(creator.email, '@', 1), ''),
      'Thanh vien'
    ),
    40
  );

  insert into public.group_participants (group_id, user_id, display_name, email)
  values (new.id, new.created_by, nickname, creator.email)
  on conflict (group_id, user_id) do nothing;

  insert into public.members (group_id, name, account_id)
  values (new.id, nickname, new.created_by)
  on conflict (group_id, account_id) where account_id is not null do nothing;

  return new;
end
$$;

alter function public.register_group_creator() set search_path = '';

insert into public.members (group_id, name, account_id)
select
  groups.id,
  left(
    coalesce(
      nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(users.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(users.email, '@', 1), ''),
      'Thanh vien'
    ),
    40
  ),
  groups.created_by
from public.groups as groups
join auth.users as users on users.id = groups.created_by
where not exists (
  select 1
  from public.members
  where members.group_id = groups.id
    and members.account_id = groups.created_by
)
on conflict (group_id, account_id) where account_id is not null do nothing;
