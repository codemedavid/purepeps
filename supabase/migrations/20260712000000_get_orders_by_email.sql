-- Pure Peps — Track orders by email address.
--
-- Adds get_orders_by_email, a customer-facing lookup that returns EVERY order
-- bundle placed under a given email so the storefront tracking page can offer
-- "track by email" in addition to the existing exact-order-number lookup.
--
-- SECURITY NOTE (accepted product decision): unlike an order number, an email is
-- enumerable, so this RPC lets anyone who knows a customer's email read that
-- customer's order list and shipping info. To keep the exposed surface minimal
-- and predictable we (a) expose ONLY this SECURITY DEFINER function — anon still
-- cannot SELECT the orders table directly — (b) cap the result to the customer's
-- 25 most-recent order bundles, and (c) exclude cancelled root orders. Ownership
-- is NOT verified here; add a captcha / magic-link step later if that changes.
--
-- The returned column shape is IDENTICAL to get_order_bundle (20260708000000) so
-- the client can reuse the same OrderBundleRow type and rendering. Rows span
-- multiple bundles; each row carries parent_order_id so the client can regroup
-- them by root (COALESCE(parent_order_id, id)). Rows are ordered newest bundle
-- first, then root -> repeats -> claim add-ons within each bundle.
--
-- Idempotent; safe to re-run.

DROP FUNCTION IF EXISTS public.get_orders_by_email(TEXT);
CREATE FUNCTION public.get_orders_by_email(email_input TEXT)
RETURNS TABLE (
  id UUID, order_number TEXT, order_status TEXT, payment_status TEXT, payment_method_name TEXT,
  tracking_number TEXT, shipping_provider TEXT, shipping_note TEXT,
  total_price DECIMAL(10,2), shipping_fee DECIMAL(10,2),
  order_items JSONB, created_at TIMESTAMPTZ, promo_code TEXT, discount_applied DECIMAL(10,2),
  fulfillment_stage TEXT, is_claim BOOLEAN, parent_order_id UUID, group_buy_batch_id UUID, batch_status TEXT,
  paid_total DECIMAL(10,2), balance_due DECIMAL(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Match emails the same way checkout normalizes them (see enforce_group_buy_on_order).
  v_email := lower(btrim(coalesce(email_input, '')));
  IF v_email = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- The customer's most-recent non-cancelled ROOT orders (Order 1 of each bundle).
  -- Repeats and claim add-ons attach to a root and come back via the join below.
  WITH roots AS (
    SELECT o.id AS root_id, o.created_at AS root_created
    FROM public.orders o
    WHERE o.is_claim = false
      AND o.parent_order_id IS NULL
      AND o.order_status <> 'cancelled'
      AND lower(btrim(o.customer_email)) = v_email
    ORDER BY o.created_at DESC
    LIMIT 25
  )
  SELECT o.id, o.order_number, o.order_status, o.payment_status, o.payment_method_name,
    o.tracking_number, o.shipping_provider, o.shipping_note, o.total_price, o.shipping_fee,
    o.order_items, o.created_at, o.promo_code, o.discount_applied,
    gb.fulfillment_stage, o.is_claim, o.parent_order_id, o.group_buy_batch_id, gb.status,
    o.paid_total,
    CASE WHEN o.paid_total IS NOT NULL THEN GREATEST(0, o.total_price - o.paid_total) ELSE 0 END
  FROM public.orders o
  JOIN roots r ON (o.id = r.root_id OR o.parent_order_id = r.root_id)
  LEFT JOIN public.group_buy_batches gb ON gb.id = o.group_buy_batch_id
  ORDER BY r.root_created DESC, o.is_claim, o.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_orders_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_by_email(TEXT) TO anon, authenticated;
