-- Explicit table privileges keep newly created public tables reachable through
-- the Data API while preserving the existing authenticated-user and RLS rules.
grant select, insert, update, delete
  on public.groups, public.members, public.expenses, public.payments
  to service_role;

grant select, insert, update, delete
  on public.group_participants, public.group_chat_messages
  to service_role;

grant usage, select on sequence public.group_chat_messages_id_seq to service_role;

-- Audit rows remain immutable and are only readable by application roles.
grant select on public.group_audit_log to service_role;
