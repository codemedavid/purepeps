-- Pure Peps — Batch fulfillment stage (shared international leg) + tracking RPC.
--
-- A group buy ships as ONE shipment: supplier -> international logistics -> PH.
-- That leg is identical for every order in the batch, so it lives on the BATCH
-- (group_buy_batches.fulfillment_stage) and an admin advances it once for all
-- orders at the same time. The per-order LOCAL leg (packing -> out for delivery
-- -> delivered) stays on orders.order_status. The public tracking RPC now also
-- returns the batch stage so the storefront can merge the two into one timeline.
--
-- Mirrors existing patterns: admin writes to group_buy_batches are already gated
-- by the is_admin() RLS policy (see 20260622000000), so no new RPC is needed to
-- set the stage. Idempotent; safe to run in the Supabase SQL editor.

-- ===========================================================================
-- 1. Shared international-leg stage on the batch.
--    Nullable: NULL = fulfillment not started. The four stages match the
--    customer-facing tracking steps between "Confirmed" and "Arrived in PH".
-- ===========================================================================
ALTER TABLE public.group_buy_batches
  ADD COLUMN IF NOT EXISTS fulfillment_stage TEXT
  CHECK (fulfillment_stage IN ('preparing', 'in_logistics', 'enroute_ph', 'arrived_ph'));

-- ===========================================================================
-- 2. Expose the batch stage to the public order-tracking RPC.
--    Changing the RETURNS TABLE shape requires DROP before CREATE. Stays
--    SECURITY DEFINER so it can read orders (anon has no SELECT) and the batch
--    row; fulfillment_stage is appended as the final column so existing JSON
--    consumers (which read by name) are unaffected.
-- ===========================================================================
DROP FUNCTION IF EXISTS get_order_details(text);

CREATE OR REPLACE FUNCTION get_order_details(order_id_input TEXT)
RETURNS TABLE (
  id UUID,
  order_number TEXT,
  order_status TEXT,
  payment_status TEXT,
  tracking_number TEXT,
  shipping_provider TEXT,
  shipping_note TEXT,
  total_price DECIMAL(10,2),
  shipping_fee DECIMAL(10,2),
  order_items JSONB,
  created_at TIMESTAMPTZ,
  promo_code TEXT,
  discount_applied DECIMAL(10,2),
  fulfillment_stage TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.order_number,
    o.order_status,
    o.payment_status,
    o.tracking_number,
    o.shipping_provider,
    o.shipping_note,
    o.total_price,
    o.shipping_fee,
    o.order_items,
    o.created_at,
    o.promo_code,
    o.discount_applied,
    gb.fulfillment_stage
  FROM orders o
  LEFT JOIN public.group_buy_batches gb ON gb.id = o.group_buy_batch_id
  WHERE
    o.order_number ILIKE order_id_input
    OR o.id::text ILIKE order_id_input || '%'
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_details(TEXT) TO public;
