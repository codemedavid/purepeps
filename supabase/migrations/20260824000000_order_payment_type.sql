-- Pure Peps — Pay Now / Cash on Delivery payment options.
--
-- Checkout gains two payment options. This migration adds the columns; the
-- enforcement (RLS + trigger) and the confirmed-order redefinition follow in
-- 20260824000100 and 20260824000150.
--
--   payment_type  — how the customer chose to pay.
--       'pay_now' : the existing flow — pick an online payment method, pay via
--                   QR/bank transfer, upload proof. Payment precedes the order.
--       'cod'     : courier collects cash on delivery. No online payment, no
--                   proof at checkout. There is NO COD surcharge — the customer
--                   pays exactly total_price + shipping_fee, same as Pay Now.
--
--   refunded_total — how much has been refunded. Follows the paid_total pattern
--       from 20260707000000: store the amount, DERIVE the rest. 'refunded' vs
--       'partially_refunded' is stored as a status token (the business asked for
--       both explicitly) but must stay consistent with this amount.
--
--   manually_confirmed_at / _by — the audit trail for the rule that a FAILED or
--       UNPAID Pay Now order must not count as a confirmed order UNLESS an admin
--       confirms it by hand. Without this we could not tell "admin deliberately
--       accepted this risk" from "order drifted into confirmed while unpaid".
--
-- BACKFILL: every pre-existing order required proof of payment at checkout, so
-- 'pay_now' is the correct historical value and the column default backfills it.
--
-- Idempotent; safe to re-run.

-- ===========================================================================
-- 1. Columns
-- ===========================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'pay_now',
  ADD COLUMN IF NOT EXISTS refunded_total DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS manually_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manually_confirmed_by TEXT;

COMMENT ON COLUMN public.orders.payment_type IS
  'How the customer chose to pay: pay_now (online, proof required) or cod (courier collects cash). No COD surcharge.';
COMMENT ON COLUMN public.orders.refunded_total IS
  'Amount refunded so far. NULL/0 means never refunded. Must be <= total_price + shipping_fee.';
COMMENT ON COLUMN public.orders.manually_confirmed_at IS
  'Set when an admin confirms an order whose payment has NOT been verified (failed/pending Pay Now). Makes the order count as confirmed. NULL otherwise.';
COMMENT ON COLUMN public.orders.manually_confirmed_by IS
  'Admin who manually confirmed an unverified order. Audit trail for manually_confirmed_at.';

-- ===========================================================================
-- 2. Constraints
--
-- Added NOT VALID so a legacy row carrying an unexpected token can never block
-- the deploy. NOT VALID still enforces on every INSERT and UPDATE — it only
-- skips the one-time scan of existing rows. We then TRY to validate, and
-- downgrade a failure to a NOTICE listing what to clean up.
-- ===========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_payment_type_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_type_check
      CHECK (payment_type IN ('pay_now', 'cod')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_payment_status_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN (
        'pending',            -- "Pending Payment" (label lives in src/constants/payment.ts)
        'submitted',          -- receipt uploaded, awaiting admin review (pre-existing)
        'paid',
        'failed',
        'refunded',
        'partially_refunded'
      )) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_refunded_total_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_refunded_total_check
      CHECK (refunded_total IS NULL OR refunded_total >= 0) NOT VALID;
  END IF;
END $$;

-- Validated one per block: sharing a handler would mean a failure on the first
-- constraint silently skips the second, leaving it NOT VALID with no notice.
DO $$
BEGIN
  ALTER TABLE public.orders VALIDATE CONSTRAINT orders_payment_type_check;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'orders_payment_type_check left NOT VALID — existing rows violate it. New writes are still checked.';
END $$;

DO $$
BEGIN
  ALTER TABLE public.orders VALIDATE CONSTRAINT orders_refunded_total_check;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'orders_refunded_total_check left NOT VALID — existing rows violate it. New writes are still checked.';
END $$;

DO $$
DECLARE
  v_bad TEXT;
BEGIN
  ALTER TABLE public.orders VALIDATE CONSTRAINT orders_payment_status_check;
EXCEPTION WHEN check_violation THEN
  SELECT string_agg(DISTINCT payment_status, ', ') INTO v_bad
  FROM public.orders
  WHERE payment_status NOT IN
    ('pending', 'submitted', 'paid', 'failed', 'refunded', 'partially_refunded');
  RAISE NOTICE 'orders_payment_status_check left NOT VALID. Unexpected existing values: %. New writes are still checked.', v_bad;
END $$;

-- ===========================================================================
-- 3. Index — the admin orders list filters by payment type.
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_orders_payment_type ON public.orders(payment_type);
