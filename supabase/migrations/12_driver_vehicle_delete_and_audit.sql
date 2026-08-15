-- Edit + soft-delete for Drivers and Vehicles. These had no edit or
-- delete UI at all before now (Add only).
--
-- Soft delete, not a real DELETE: fuel_entries.vehicle_id,
-- fuel_entries.driver_id, and garage_expenses.vehicle_id are all
-- ON DELETE CASCADE (01_initial_schema.sql). A real delete on a vehicle
-- or driver that already has trip/expense history would silently wipe
-- every one of those records — directly against this app's append-only,
-- no-destructive-overwrites principle (CLAUDE.md #4). Marking deleted_at
-- instead means the row still exists to satisfy those foreign keys (so
-- historical entries keep displaying correctly), while store.ts filters
-- it out of active dropdowns/lists. A separate, explicit "clear log"
-- action (src/lib/store.ts's clearDeletedVehiclesLog/clearDeletedDriversLog)
-- is the only path that actually runs a real DELETE, and it's always the
-- user's own deliberate, warned choice.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_at ON public.vehicles (org_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_drivers_deleted_at ON public.drivers (org_id, deleted_at);

-- Edit audit trail — same append-only shape as entry_audit_logs /
-- garage_expense_audit_logs. The delete/restore events are recorded here
-- too (field_name = 'deleted_at'), so one table tells the full story for
-- a given vehicle or driver.
CREATE TABLE IF NOT EXISTS public.vehicle_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id),
  entry_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  field_name VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(100),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.driver_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id),
  entry_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
  field_name VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(100),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_audit_logs_entry ON public.vehicle_audit_logs (entry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_audit_logs_org ON public.vehicle_audit_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_driver_audit_logs_entry ON public.driver_audit_logs (entry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_audit_logs_org ON public.driver_audit_logs (org_id);

ALTER TABLE public.vehicle_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_audit_logs ENABLE ROW LEVEL SECURITY;

-- Read + insert only, same as the other audit-log tables — never
-- updatable/deletable by the application (no UPDATE/DELETE policy ->
-- denied by default), keeping the trail itself tamper-proof.
CREATE POLICY "org_read_vehicle_audit_logs" ON public.vehicle_audit_logs
  FOR SELECT USING (org_id = public.current_org_id());
CREATE POLICY "org_insert_vehicle_audit_logs" ON public.vehicle_audit_logs
  FOR INSERT WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "org_read_driver_audit_logs" ON public.driver_audit_logs
  FOR SELECT USING (org_id = public.current_org_id());
CREATE POLICY "org_insert_driver_audit_logs" ON public.driver_audit_logs
  FOR INSERT WITH CHECK (org_id = public.current_org_id());
