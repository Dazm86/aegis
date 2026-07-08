-- Enables safe access from the browser (using the public "anon" key) instead of
-- the secret service_role key. Run this in Supabase SQL Editor.

alter table missions enable row level security;
alter table council_decisions enable row level security;
alter table decisions enable row level security;
alter table content_queue enable row level security;
alter table versions enable row level security;

-- Anyone with the anon key can READ these (they're not sensitive) -----------
create policy "public read missions" on missions
  for select using (true);

create policy "public read council_decisions" on council_decisions
  for select using (true);

create policy "public read decisions" on decisions
  for select using (true);

create policy "public read content_queue" on content_queue
  for select using (true);

create policy "public read versions" on versions
  for select using (true);

-- Only a logged-in (authenticated) user can approve/reject queue items -----
-- Since this is a single-owner system, "authenticated" == the Owner, as long
-- as you never share the login with anyone else.
create policy "owner update content_queue" on content_queue
  for update using (auth.role() = 'authenticated');

-- budget_tracker, audit_log, violations stay locked down (service_role only,
-- i.e. only the backend/GitHub Actions can see them) — no policy needed since
-- RLS defaults to deny-all once enabled. If you want them visible on the
-- dashboard later, add read policies for them the same way as above.
