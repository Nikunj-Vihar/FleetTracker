-- Adds the tenant boundary column to every table that holds a single
-- org's data. All 7 tables below are confirmed empty in production (no
-- one has signed in yet — see the multi-tenant sign-up plan), so org_id
-- can go straight to NOT NULL with no backfill step. If this ever fails
-- because a table isn't actually empty, that's a loud, safe failure —
-- stop and backfill explicitly rather than guessing.
--
-- DEFAULT public.current_org_id() means every future insert coming
-- from the app (which always carries the signed-in user's JWT via
-- getSupabaseClient()) gets stamped with the right org automatically,
-- the same way id already relies on gen_random_uuid() — no store.ts
-- create* function needs to pass org_id explicitly.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id);
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id);
ALTER TABLE public.fuel_entries
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id);
ALTER TABLE public.entry_audit_logs
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id);
ALTER TABLE public.garages
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id);
ALTER TABLE public.garage_expenses
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id);
ALTER TABLE public.garage_expense_audit_logs
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_vehicles_org ON public.vehicles (org_id);
CREATE INDEX IF NOT EXISTS idx_drivers_org ON public.drivers (org_id);
CREATE INDEX IF NOT EXISTS idx_fuel_entries_org ON public.fuel_entries (org_id);
CREATE INDEX IF NOT EXISTS idx_entry_audit_logs_org ON public.entry_audit_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_garages_org ON public.garages (org_id);
CREATE INDEX IF NOT EXISTS idx_garage_expenses_org ON public.garage_expenses (org_id);
CREATE INDEX IF NOT EXISTS idx_garage_expense_audit_logs_org ON public.garage_expense_audit_logs (org_id);

-- settings is the one table with existing rows (the 2 generic global
-- defaults from 01_initial_schema.sql — not client-specific). Each org
-- needs its own fuel rate / anomaly threshold, so the primary key
-- becomes (org_id, key) instead of key alone. The old global rows are
-- dropped; 08_signup_trigger.sql reseeds two default rows per org as
-- part of account creation.
DELETE FROM public.settings;
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id);
ALTER TABLE public.settings ADD PRIMARY KEY (org_id, key);
