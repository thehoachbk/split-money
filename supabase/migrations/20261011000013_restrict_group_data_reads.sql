drop policy if exists "expenses can be read by group link or admin" on public.expenses;
create policy "expenses can be read by group participant or admin"
  on public.expenses
  for select to authenticated
  using (
    (group_id = public.current_group_id() and public.can_edit_group(group_id))
    or public.is_system_admin()
  );

drop policy if exists "payments can be read by group link or admin" on public.payments;
create policy "payments can be read by group participant or admin"
  on public.payments
  for select to authenticated
  using (
    (group_id = public.current_group_id() and public.can_edit_group(group_id))
    or public.is_system_admin()
  );

drop policy if exists "audit log can be read by group or admin" on public.group_audit_log;
create policy "audit log can be read by group participant or admin"
  on public.group_audit_log
  for select to authenticated
  using (
    (group_id = public.current_group_id() and public.can_edit_group(group_id))
    or public.is_system_admin()
  );
