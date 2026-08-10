-- Create Vehicles Table
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no VARCHAR(50) UNIQUE NOT NULL,
  model VARCHAR(100),
  starting_odometer NUMERIC NOT NULL DEFAULT 0,
  expected_avg NUMERIC(5,2), -- Baseline km/l
  tank_capacity NUMERIC(6,2) NOT NULL DEFAULT 300.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Drivers Table
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Fuel Log Entries Table
CREATE TABLE IF NOT EXISTS public.fuel_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  place VARCHAR(200),
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
  onward_reading NUMERIC NOT NULL,
  return_reading NUMERIC NOT NULL,
  total_kms NUMERIC GENERATED ALWAYS AS (return_reading - onward_reading) STORED,
  diesel_consumed NUMERIC NOT NULL,
  average_kml NUMERIC GENERATED ALWAYS AS (
    CASE WHEN diesel_consumed > 0 THEN (return_reading - onward_reading) / diesel_consumed ELSE 0 END
  ) STORED,
  is_continuity_broken BOOLEAN DEFAULT FALSE,
  is_anomalous BOOLEAN DEFAULT FALSE,
  anomaly_direction VARCHAR(20), -- 'WORSE' or 'BETTER'
  anomaly_deviation_pct NUMERIC(5,2),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Audit Logs Table
CREATE TABLE IF NOT EXISTS public.entry_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES public.fuel_entries(id) ON DELETE CASCADE,
  field_name VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(100),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Application Settings Table
CREATE TABLE IF NOT EXISTS public.settings (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Settings
INSERT INTO public.settings (key, value) VALUES
  ('fuel_rate_inr', '95.50'),
  ('anomaly_threshold_pct', '8.0')
ON CONFLICT (key) DO NOTHING;

-- Helpful indexes for the lookups the app performs constantly
CREATE INDEX IF NOT EXISTS idx_fuel_entries_vehicle_date ON public.fuel_entries (vehicle_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_entries_driver_date ON public.fuel_entries (driver_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entry ON public.entry_audit_logs (entry_id, created_at DESC);

-- Keep updated_at current on every correction
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fuel_entries_updated_at ON public.fuel_entries;
CREATE TRIGGER trg_fuel_entries_updated_at
  BEFORE UPDATE ON public.fuel_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
