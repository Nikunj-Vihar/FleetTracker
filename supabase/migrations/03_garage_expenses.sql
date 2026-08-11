-- Garage / maintenance expense tracking. Mirrors the fuel_entries pattern:
-- every expense row anchors to vehicles.id (UUID), never to the plate
-- string, and corrections are append-only via garage_expense_audit_logs
-- rather than silent overwrites (same rule as CLAUDE.md #4 for fuel_entries).

-- Lightweight master data for service vendors, same shape/purpose as
-- drivers — keeps "Universal", "Universal Tyres", "Universal Traxing" from
-- fragmenting into different strings across entries.
CREATE TABLE IF NOT EXISTS public.garages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) UNIQUE NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per bill/invoice. `category` defaults to the garage ledger this
-- was transcribed from, but stays a plain column (not an enum) so future
-- expense types (tolls, driver allowance, etc.) don't need a schema change.
CREATE TABLE IF NOT EXISTS public.garage_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  odometer_reading NUMERIC,
  work_description TEXT NOT NULL,
  garage_id UUID REFERENCES public.garages(id) ON DELETE SET NULL,
  bill_no VARCHAR(100),
  amount NUMERIC(10,2) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'Garage/Maintenance',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Corrections audit trail — separate table (not a shared/polymorphic one)
-- so the FK to garage_expenses stays a real referential-integrity
-- constraint, same reasoning as entry_audit_logs -> fuel_entries.
CREATE TABLE IF NOT EXISTS public.garage_expense_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES public.garage_expenses(id) ON DELETE CASCADE,
  field_name VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(100),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garage_expenses_vehicle_date ON public.garage_expenses (vehicle_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_garage_expenses_garage ON public.garage_expenses (garage_id);
CREATE INDEX IF NOT EXISTS idx_garage_expense_audit_logs_entry ON public.garage_expense_audit_logs (entry_id, created_at DESC);

-- Reuses public.set_updated_at() defined in 01_initial_schema.sql.
DROP TRIGGER IF EXISTS trg_garage_expenses_updated_at ON public.garage_expenses;
CREATE TRIGGER trg_garage_expenses_updated_at
  BEFORE UPDATE ON public.garage_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
