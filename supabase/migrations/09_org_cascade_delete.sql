-- 06_multi_tenant_columns.sql added org_id as a plain REFERENCES with no
-- ON DELETE behavior, so it defaulted to RESTRICT — deleting an
-- organization would fail with a foreign key violation as soon as it had
-- any vehicles/entries/etc. Needed for account deletion (deleting an org
-- must cascade to every tenant table, same as vehicle_id/driver_id
-- already cascade within fuel_entries).
--
-- Constraint names are Postgres's default auto-generated names for a
-- column-level REFERENCES added via ADD COLUMN: <table>_<column>_fkey.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vehicles', 'drivers', 'fuel_entries', 'entry_audit_logs',
    'garages', 'garage_expenses', 'garage_expense_audit_logs', 'settings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_org_id_fkey');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE',
      t, t || '_org_id_fkey'
    );
  END LOOP;
END $$;
