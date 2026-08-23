-- Pure Peps — Preserve existing confirmed counts across the payment-aware switch.
--
-- 20260824000150 redefined confirmed_quantity to require a settled payment.
-- Applied to a live database that has none of this feature's history, that
-- silently LOWERS confirmed demand on batches already in flight:
--
--   * A legacy row with payment_status IS NULL fails `NOT IN (...)` in SQL
--     (NULL NOT IN yields NULL, not true), so it drops out entirely.
--   * An order advanced past 'new' by an admin who used the status dropdown
--     rather than the Confirm button still carries payment_status='pending',
--     so it stops counting even though it is being packed and shipped.
--
-- Neither raises an error. Caps would quietly gain free slots and the closeout
-- panel would disagree with what was actually ordered.
--
-- This migration makes the existing state explicit rather than reinterpreting
-- it. Anything already advanced past 'new' was, by definition, confirmed by an
-- admin under the OLD rule — so that decision is recorded as what it was: a
-- manual confirmation, with an audit note saying it came from this backfill and
-- not from a person clicking through the new flow.
--
-- Ordering: must run AFTER 20260824000150. It touches only rows that predate
-- this deploy (manually_confirmed_at IS NULL), so re-running is a no-op.
--
-- Idempotent; safe to re-run.

-- ===========================================================================
-- 1. Normalize legacy NULL payment_status so the NOT IN predicate can see it.
-- ===========================================================================
UPDATE public.orders
SET payment_status = 'pending'
WHERE payment_status IS NULL;

-- ===========================================================================
-- 2. Preserve the confirmed status of orders advanced under the old rule.
--
--    Deliberately scoped to orders whose payment has NOT settled — a paid or
--    COD order already satisfies the new predicate on its own and needs no
--    stamp. Cancelled and 'new' orders were never confirmed under either rule.
-- ===========================================================================
UPDATE public.orders
SET manually_confirmed_at = COALESCE(updated_at, created_at, now()),
    manually_confirmed_by = 'backfill:20260824000400'
WHERE manually_confirmed_at IS NULL
  AND order_status NOT IN ('new', 'cancelled')
  AND payment_type <> 'cod'
  AND payment_status <> 'paid'
  AND NOT (payment_status = 'submitted' AND paid_total IS NOT NULL);

-- ===========================================================================
-- 3. Report what was preserved, so the operator can see the blast radius
--    instead of discovering it later in the cap numbers.
-- ===========================================================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.orders
  WHERE manually_confirmed_by = 'backfill:20260824000400';

  RAISE NOTICE
    'Backfill preserved % pre-existing confirmed order(s) whose payment never settled. Review them: SELECT order_number, order_status, payment_status FROM orders WHERE manually_confirmed_by = ''backfill:20260824000400'';',
    v_count;
END $$;
