# Agent instructions

## Project

This is a Vietnamese expense-splitting web app. The MVP uses React and Vite for the frontend, Supabase Postgres for shared data, and GitHub Pages for hosting. Read `README.md` for setup and deployment steps.

## Product and data rules

- Keep the user interface in Vietnamese and preserve the lightweight Google-authenticated MVP unless the user asks to change its scope.
- Money is stored and calculated as integer VND. Keep balance calculations in `src/settle.js` and add or update tests in `src/settle.test.js` when changing that behavior.
- The group UUID is in the URL fragment and is sent as `x-group-id`; the SQL policies in `supabase/migrations/` depend on this. Signed-in users with a group's link can edit it, only its creator can delete it, and `thehoach92@gmail.com` is the system admin with access to all groups.
- Database triggers create immutable audit entries for all group, member, expense, and payment changes, including deletes. Do not add client-side audit writes or allow audit rows to be edited/deleted.
- The Supabase anon key is expected in browser builds. Never expose a Supabase `service_role` key or commit OAuth client secrets. Local values belong in ignored `.env` files; deployment uses GitHub Actions secrets.
- `supabase/schema.sql` initializes a new database; changes to an already-deployed schema need an explicit migration in `supabase/migrations/`.

## Working agreements

- Make focused changes that match the existing React/Vite and Supabase patterns. Avoid adding dependencies or broad refactors without a clear need.
- Keep Supabase errors visible to the user; do not silently turn failed reads or writes into successful-looking state.
- For relevant changes, run `npm test` and `npm run build`. Update `README.md` when setup, security expectations, database steps, or deployment behavior changes.
- Do not commit, push, or change unrelated worktree files unless the user explicitly asks.
