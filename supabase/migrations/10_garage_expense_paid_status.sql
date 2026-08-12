-- Paid/settled tracking for garage expenses. A bill is logged when the work
-- is done but may not be paid immediately; this lets the app answer "what do
-- we still owe" instead of only "what have we spent," mirroring how the
-- paper ledger gets a manual checkmark once a bill is settled.
ALTER TABLE public.garage_expenses
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS paid_date DATE;

CREATE INDEX IF NOT EXISTS idx_garage_expenses_unpaid
  ON public.garage_expenses (org_id, is_paid)
  WHERE is_paid = FALSE;
