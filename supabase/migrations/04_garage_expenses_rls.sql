-- RLS for the garage/maintenance expense tables added in
-- 03_garage_expenses.sql. Same authenticated-only policy shape as
-- 02_row_level_security.sql — see that file's header note about adding
-- org_id predicates if this ever becomes multi-tenant.

ALTER TABLE public.garages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_expense_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_garages" ON public.garages;
CREATE POLICY "authenticated_all_garages" ON public.garages
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_all_garage_expenses" ON public.garage_expenses;
CREATE POLICY "authenticated_all_garage_expenses" ON public.garage_expenses
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Audit logs: readable and insertable, never updatable/deletable by the
-- application (no UPDATE/DELETE policy defined -> denied by default).
DROP POLICY IF EXISTS "authenticated_read_garage_expense_audit_logs" ON public.garage_expense_audit_logs;
CREATE POLICY "authenticated_read_garage_expense_audit_logs" ON public.garage_expense_audit_logs
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_insert_garage_expense_audit_logs" ON public.garage_expense_audit_logs;
CREATE POLICY "authenticated_insert_garage_expense_audit_logs" ON public.garage_expense_audit_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
