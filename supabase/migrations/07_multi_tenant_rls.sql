-- Replaces the single-tenant "any authenticated user sees everything"
-- policies from 02_row_level_security.sql and 04_garage_expenses_rls.sql
-- with org-scoped ones, now that every table carries org_id
-- (06_multi_tenant_columns.sql). Same USING/WITH CHECK split as before
-- per table — only the predicate changes.

-- Drop the old single-tenant policies.
DROP POLICY IF EXISTS "authenticated_all_vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "authenticated_all_drivers" ON public.drivers;
DROP POLICY IF EXISTS "authenticated_all_fuel_entries" ON public.fuel_entries;
DROP POLICY IF EXISTS "authenticated_read_audit_logs" ON public.entry_audit_logs;
DROP POLICY IF EXISTS "authenticated_insert_audit_logs" ON public.entry_audit_logs;
DROP POLICY IF EXISTS "authenticated_all_settings" ON public.settings;
DROP POLICY IF EXISTS "authenticated_all_garages" ON public.garages;
DROP POLICY IF EXISTS "authenticated_all_garage_expenses" ON public.garage_expenses;
DROP POLICY IF EXISTS "authenticated_read_garage_expense_audit_logs" ON public.garage_expense_audit_logs;
DROP POLICY IF EXISTS "authenticated_insert_garage_expense_audit_logs" ON public.garage_expense_audit_logs;

-- Org-scoped replacements.
CREATE POLICY "org_all_vehicles" ON public.vehicles
  FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "org_all_drivers" ON public.drivers
  FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "org_all_fuel_entries" ON public.fuel_entries
  FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "org_read_audit_logs" ON public.entry_audit_logs
  FOR SELECT
  USING (org_id = public.current_org_id());
CREATE POLICY "org_insert_audit_logs" ON public.entry_audit_logs
  FOR INSERT
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "org_all_settings" ON public.settings
  FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "org_all_garages" ON public.garages
  FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "org_all_garage_expenses" ON public.garage_expenses
  FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "org_read_garage_expense_audit_logs" ON public.garage_expense_audit_logs
  FOR SELECT
  USING (org_id = public.current_org_id());
CREATE POLICY "org_insert_garage_expense_audit_logs" ON public.garage_expense_audit_logs
  FOR INSERT
  WITH CHECK (org_id = public.current_org_id());

-- New tables: users may only see their own organization / membership
-- row. No INSERT policy needed on either — the only writes come from
-- handle_new_user() (08_signup_trigger.sql), which runs as the table
-- owner via SECURITY DEFINER and bypasses RLS entirely, same as any
-- owner-run migration.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_own_org" ON public.organizations
  FOR SELECT
  USING (id = public.current_org_id());

CREATE POLICY "users_read_own_membership" ON public.org_members
  FOR SELECT
  USING (user_id = auth.uid());
