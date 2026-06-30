-- Pure Peps — Order balance fields for post-checkout invoice edits.
--
-- When an admin adds items to an order that the customer has ALREADY paid for,
-- the order grows a balance: the difference between the new total and what was
-- paid. We record what has been paid (paid_total) and where a new receipt for the
-- balance lives (additional_payment_proof_url). balance_due is NOT stored — it is
-- derived (max(0, total_price - paid_total)) so it can never drift out of sync.
--
-- paid_total is set when an order is confirmed/verified as paid. For orders that
-- were already paid before this migration, we backfill paid_total = total_price
-- so they are NOT misread as having an outstanding balance.
--
-- Idempotent; safe to re-run.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_total DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS additional_payment_proof_url TEXT;

COMMENT ON COLUMN public.orders.paid_total IS
  'Order total that has been confirmed paid. balance_due = max(0, total_price - paid_total). NULL means never confirmed paid.';
COMMENT ON COLUMN public.orders.additional_payment_proof_url IS
  'Receipt covering the balance owed after items were added post-payment. Cleared whenever the total changes again.';

-- Backfill: an already-paid order is fully paid up to its current total.
UPDATE public.orders
SET paid_total = total_price
WHERE payment_status = 'paid' AND paid_total IS NULL;
