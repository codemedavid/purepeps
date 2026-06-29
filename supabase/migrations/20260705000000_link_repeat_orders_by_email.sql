-- Pure Peps — Link repeat orders from the same email under one tracking.
--
-- When a customer checks out again with the SAME email during the SAME open
-- group-buy batch, the new order is attached to their first order in that batch
-- via parent_order_id, so all of their orders share one tracking lookup and
-- show up as Order 1, Order 2, … Each order keeps its own payment method,
-- payment proof, and status — it is a normal (non-claim) order, just linked.
--
-- Why server-side: the storefront runs as anon, which cannot read orders back
-- (PII lockdown), so it cannot discover the customer's prior order id to link
-- to. The checkout trigger already resolves the open batch authoritatively, so
-- it is the right place to resolve the parent too. This is distinct from
-- leftover CLAIMS (is_claim = true), which only exist while a batch is
-- finalizing; repeat orders are is_claim = false and happen while OPEN.
--
-- Idempotent; safe to re-run.

-- ===========================================================================
-- 1. Checkout trigger — auto-link a repeat order to the customer's first order
--    in the same open batch. Claim handling is unchanged from the hardening
--    migration (20260624000300); only the non-claim ELSE branch gains linking.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.enforce_group_buy_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_status   TEXT;
  v_existing_root UUID;
  v_email    TEXT;
  rec RECORD;
BEGIN
  IF NEW.is_claim THEN
    IF NEW.parent_order_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.orders WHERE id = NEW.parent_order_id) THEN
      RAISE EXCEPTION 'A claim must reference an existing parent order.' USING ERRCODE = 'check_violation';
    END IF;
    v_batch_id := NEW.group_buy_batch_id;
    IF v_batch_id IS NULL THEN
      RAISE EXCEPTION 'Claim order is missing its group buy batch.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT status INTO v_status FROM public.group_buy_batches WHERE id = v_batch_id;
    IF v_status IS DISTINCT FROM 'finalizing' THEN
      RAISE EXCEPTION 'Leftover claims are only allowed while the batch is finalizing.' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT id INTO v_batch_id
    FROM public.group_buy_batches
    WHERE status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
    IF v_batch_id IS NULL THEN
      RAISE EXCEPTION 'No active group buy is open. Ordering is currently closed.' USING ERRCODE = 'check_violation';
    END IF;
    -- Server-authoritative: never trust a client-supplied batch id.
    NEW.group_buy_batch_id := v_batch_id;

    -- Auto-link a repeat order to the customer's FIRST non-cancelled order in
    -- this same batch (matched by email). COALESCE collapses any chain back to
    -- the true root, so every repeat points at Order 1, not at each other.
    v_email := lower(btrim(coalesce(NEW.customer_email, '')));
    IF NEW.parent_order_id IS NULL AND v_email <> '' THEN
      SELECT COALESCE(o.parent_order_id, o.id) INTO v_existing_root
      FROM public.orders o
      WHERE o.group_buy_batch_id = v_batch_id
        AND o.is_claim = false
        AND o.order_status <> 'cancelled'
        AND lower(btrim(o.customer_email)) = v_email
      ORDER BY o.created_at ASC, o.order_number ASC
      LIMIT 1;

      IF v_existing_root IS NOT NULL THEN
        NEW.parent_order_id := v_existing_root;
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.order_items) elem
    WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id::text = (elem->>'product_id'))
  ) THEN
    RAISE EXCEPTION 'Order contains an item with an invalid or missing product reference.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('group_buy_cap:' || v_batch_id::text));

  FOR rec IN
    SELECT c.cap_quantity,
      COALESCE((SELECT SUM((elem->>'quantity')::numeric)
        FROM public.orders o CROSS JOIN LATERAL jsonb_array_elements(o.order_items) elem
        WHERE o.group_buy_batch_id = v_batch_id AND o.order_status <> 'cancelled'
          AND (elem->>'product_id') = c.product_id::text), 0) AS existing_total,
      COALESCE((SELECT SUM((elem->>'quantity')::numeric)
        FROM jsonb_array_elements(NEW.order_items) elem
        WHERE (elem->>'product_id') = c.product_id::text), 0) AS new_total
    FROM public.group_buy_caps c WHERE c.batch_id = v_batch_id
  LOOP
    IF rec.new_total > 0 AND (rec.existing_total + rec.new_total) > rec.cap_quantity THEN
      RAISE EXCEPTION 'Group buy limit reached for one of the items in your order (cap %, already reserved %, you requested %).',
        rec.cap_quantity, rec.existing_total, rec.new_total USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_group_buy_on_order() FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 2. Bundle RPC — also return payment_method_name so the tracking page can show
--    each linked order's own payment method. Exact order_number match only
--    (unchanged from the hardening migration).
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_order_bundle(TEXT);
CREATE FUNCTION public.get_order_bundle(order_id_input TEXT)
RETURNS TABLE (
  id UUID, order_number TEXT, order_status TEXT, payment_status TEXT, payment_method_name TEXT,
  tracking_number TEXT, shipping_provider TEXT, shipping_note TEXT,
  total_price DECIMAL(10,2), shipping_fee DECIMAL(10,2),
  order_items JSONB, created_at TIMESTAMPTZ, promo_code TEXT, discount_applied DECIMAL(10,2),
  fulfillment_stage TEXT, is_claim BOOLEAN, parent_order_id UUID, group_buy_batch_id UUID, batch_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root UUID;
BEGIN
  -- Exact order-number match only (order numbers are unique + non-enumerable).
  SELECT COALESCE(o.parent_order_id, o.id) INTO v_root
  FROM public.orders o
  WHERE o.order_number ILIKE btrim(order_id_input)
  ORDER BY o.parent_order_id NULLS FIRST
  LIMIT 1;

  IF v_root IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.id, o.order_number, o.order_status, o.payment_status, o.payment_method_name,
    o.tracking_number, o.shipping_provider, o.shipping_note, o.total_price, o.shipping_fee,
    o.order_items, o.created_at, o.promo_code, o.discount_applied,
    gb.fulfillment_stage, o.is_claim, o.parent_order_id, o.group_buy_batch_id, gb.status
  FROM public.orders o
  LEFT JOIN public.group_buy_batches gb ON gb.id = o.group_buy_batch_id
  WHERE o.id = v_root OR o.parent_order_id = v_root
  ORDER BY o.is_claim, o.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_bundle(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_bundle(TEXT) TO anon, authenticated;
