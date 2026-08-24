-- Pure Peps — Record WHEN an order changed state, not just what state it is in.
--
-- The tracking page can already say "your order is Packing" (computeTrackingStep
-- merges orders.order_status with the batch's fulfillment_stage), but nothing in
-- the schema remembers WHEN it became Packing. The customer-facing Order History
-- needs that history, so this migration adds the missing append-only log.
--
-- TWO tables, deliberately:
--
--   order_status_events    — per order. Written by triggers on public.orders for
--                            the local leg (order_status) and for payment_status.
--
--   group_buy_stage_events — per BATCH. The international leg (supplier -> PH) is
--                            a property of the batch, advanced once by an admin
--                            for everyone in it. Writing one row per order would
--                            mean 200 inserts for a 200-order batch every time an
--                            admin bumps a stage. One row per batch is recorded
--                            here and merged into each order's timeline at read
--                            time, mirroring how computeTrackingStep already
--                            merges the two legs client-side.
--
-- BACKFILL: existing orders get a 'placed' event synthesized from created_at and
-- nothing else. Their real transitions were never observed, and inventing
-- plausible timestamps would put fiction in front of the customer. The UI detects
-- this case (isTimelinePartial) and says the history starts here.
--
-- EXPOSURE: anon cannot SELECT public.orders (20260621000000) and must not read
-- these tables either — an event row names an order id and its states. RLS is on
-- with no anon policy; the storefront reads events only through the SECURITY
-- DEFINER RPCs in 20260825000100.
--
-- Idempotent; safe to re-run.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.order_status_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- 'placed' | 'order_status' | 'payment_status'
  event_type  TEXT NOT NULL,
  from_value  TEXT,
  to_value    TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_status_events_type_check
    CHECK (event_type IN ('placed', 'order_status', 'payment_status'))
);

CREATE TABLE IF NOT EXISTS public.group_buy_stage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID NOT NULL REFERENCES public.group_buy_batches(id) ON DELETE CASCADE,
  from_value  TEXT,
  to_value    TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A timeline is always read as "this owner, oldest first".
CREATE INDEX IF NOT EXISTS order_status_events_order_id_occurred_at_idx
  ON public.order_status_events (order_id, occurred_at);

CREATE INDEX IF NOT EXISTS group_buy_stage_events_batch_id_occurred_at_idx
  ON public.group_buy_stage_events (batch_id, occurred_at);

-- One 'placed' row per order. Also makes the backfill below re-runnable.
CREATE UNIQUE INDEX IF NOT EXISTS order_status_events_placed_once_idx
  ON public.order_status_events (order_id)
  WHERE event_type = 'placed';

-- ===========================================================================
-- 2. Triggers — orders
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.record_order_placed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_status_events (order_id, event_type, from_value, to_value, occurred_at)
  VALUES (NEW.id, 'placed', NULL, NEW.order_status, COALESCE(NEW.created_at, now()))
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_order_placed ON public.orders;
CREATE TRIGGER trg_record_order_placed
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.record_order_placed();

CREATE OR REPLACE FUNCTION public.record_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- IS DISTINCT FROM, not <>: a NULL on either side still counts as a change,
  -- and an UPDATE that rewrites the same value records nothing.
  IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    INSERT INTO public.order_status_events (order_id, event_type, from_value, to_value)
    VALUES (NEW.id, 'order_status', OLD.order_status, NEW.order_status);
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    INSERT INTO public.order_status_events (order_id, event_type, from_value, to_value)
    VALUES (NEW.id, 'payment_status', OLD.payment_status, NEW.payment_status);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_order_status_change ON public.orders;
CREATE TRIGGER trg_record_order_status_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.record_order_status_change();

-- ===========================================================================
-- 3. Trigger — batches (ONE row per batch, never fanned out over its orders)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.record_group_buy_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.fulfillment_stage IS DISTINCT FROM OLD.fulfillment_stage THEN
    INSERT INTO public.group_buy_stage_events (batch_id, from_value, to_value)
    VALUES (NEW.id, OLD.fulfillment_stage, NEW.fulfillment_stage);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_group_buy_stage_change ON public.group_buy_batches;
CREATE TRIGGER trg_record_group_buy_stage_change
  AFTER UPDATE ON public.group_buy_batches
  FOR EACH ROW EXECUTE FUNCTION public.record_group_buy_stage_change();

-- ===========================================================================
-- 4. Backfill — 'placed' only. See the header for why nothing else is invented.
-- ===========================================================================
INSERT INTO public.order_status_events (order_id, event_type, from_value, to_value, occurred_at)
SELECT o.id, 'placed', NULL, 'new', o.created_at
FROM public.orders o
WHERE o.created_at IS NOT NULL
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 5. Lockdown — admins read through their own session; the storefront never
--    touches these tables directly, only the SECURITY DEFINER RPCs.
-- ===========================================================================
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_buy_stage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_status_events_admin_read ON public.order_status_events;
CREATE POLICY order_status_events_admin_read
  ON public.order_status_events FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS group_buy_stage_events_admin_read ON public.group_buy_stage_events;
CREATE POLICY group_buy_stage_events_admin_read
  ON public.group_buy_stage_events FOR SELECT
  USING (public.is_admin());

REVOKE ALL ON public.order_status_events FROM PUBLIC, anon;
REVOKE ALL ON public.group_buy_stage_events FROM PUBLIC, anon;
GRANT SELECT ON public.order_status_events TO authenticated;
GRANT SELECT ON public.group_buy_stage_events TO authenticated;
