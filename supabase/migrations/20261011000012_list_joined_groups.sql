drop policy if exists "groups can be read by group or admin" on public.groups;
create policy "groups can be read by group or admin"
  on public.groups
  for select to authenticated
  using (
    id = public.current_group_id()
    or public.can_edit_group(id)
  );
