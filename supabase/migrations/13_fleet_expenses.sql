-- Fleet / trip expense tracking — tolls, RTO/checkpost fees, loading &
-- unloading labor, driver allowance, tyre punctures, parking: per-trip
-- operational costs, distinct from garage_expenses (vehicle-service
-- billing tied into the maintenance-due interval system). Same
-- append-only correction pattern via fleet_expense_audit_logs as every
-- other entity (CLAUDE.md #4).
--
-- Created after multi-tenancy was already established (05-09), so org_id
-- and its RLS policy go straight in here rather than as a later retrofit
-- like garage_expenses needed (03/04 then 06/07).

CREATE TABLE IF NOT EXISTS public.fleet_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  -- Free text, e.g. "ORIOF-0439" — lets related line items from the same
  -- trip be filtered/subtotaled together without a separate Trips table.
  trip_reference VARCHAR(100),
  category VARCHAR(50) NOT NULL DEFAULT 'Other',
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fleet_expense_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES public.fleet_expenses(id) ON DELETE CASCADE,
  field_name VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(100),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleet_expenses_org ON public.fleet_expenses (org_id);
CREATE INDEX IF NOT EXISTS idx_fleet_expenses_vehicle_date ON public.fleet_expenses (vehicle_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_expenses_trip_reference ON public.fleet_expenses (trip_reference);
CREATE INDEX IF NOT EXISTS idx_fleet_expense_audit_logs_org ON public.fleet_expense_audit_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_fleet_expense_audit_logs_entry ON public.fleet_expense_audit_logs (entry_id, created_at DESC);

-- Reuses public.set_updated_at() defined in 01_initial_schema.sql.
DROP TRIGGER IF EXISTS trg_fleet_expenses_updated_at ON public.fleet_expenses;
CREATE TRIGGER trg_fleet_expenses_updated_at
  BEFORE UPDATE ON public.fleet_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fleet_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_expense_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_all_fleet_expenses" ON public.fleet_expenses
  FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "org_read_fleet_expense_audit_logs" ON public.fleet_expense_audit_logs
  FOR SELECT
  USING (org_id = public.current_org_id());
CREATE POLICY "org_insert_fleet_expense_audit_logs" ON public.fleet_expense_audit_logs
  FOR INSERT
  WITH CHECK (org_id = public.current_org_id());
