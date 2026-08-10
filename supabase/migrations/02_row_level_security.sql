-- Row Level Security: this is financial/operational data tied directly to
-- the client's cost control, so every table is locked down to authenticated
-- users only. Anonymous (public) access is denied outright.
--
-- Single-tenant for now (one fleet client). If this tool is later offered to
-- more than one client, add an `org_id` column to each table and swap the
-- `auth.role() = 'authenticated'` checks below for `org_id = current_org()`
-- style predicates instead of loosening these policies.

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Vehicles: any authenticated user can read/write the fleet master list
DROP POLICY IF EXISTS "authenticated_all_vehicles" ON public.vehicles;
CREATE POLICY "authenticated_all_vehicles" ON public.vehicles
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Drivers
DROP POLICY IF EXISTS "authenticated_all_drivers" ON public.drivers;
CREATE POLICY "authenticated_all_drivers" ON public.drivers
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Fuel entries: append-only in spirit, but Postgres RLS still needs an
-- UPDATE policy since corrections update the row while writing an audit
-- record alongside it (see entry_audit_logs). The application layer is
-- responsible for always calling recordAuditLog() before/with any update.
DROP POLICY IF EXISTS "authenticated_all_fuel_entries" ON public.fuel_entries;
CREATE POLICY "authenticated_all_fuel_entries" ON public.fuel_entries
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Audit logs: readable and insertable by authenticated users, never
-- updatable or deletable by the application (no UPDATE/DELETE policy is
-- defined, so both are denied by default under RLS).
DROP POLICY IF EXISTS "authenticated_read_audit_logs" ON public.entry_audit_logs;
CREATE POLICY "authenticated_read_audit_logs" ON public.entry_audit_logs
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_insert_audit_logs" ON public.entry_audit_logs;
CREATE POLICY "authenticated_insert_audit_logs" ON public.entry_audit_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Settings: readable by all authenticated users, writable too (fuel rate /
-- anomaly threshold tuning happens from the Settings screen).
DROP POLICY IF EXISTS "authenticated_all_settings" ON public.settings;
CREATE POLICY "authenticated_all_settings" ON public.settings
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
