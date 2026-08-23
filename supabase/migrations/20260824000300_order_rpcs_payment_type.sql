-- Pure Peps — Surface payment_type through the customer-facing order RPCs.
--
-- anon cannot SELECT public.orders (20260621000000), so the storefront sees an
-- order only through these SECURITY DEFINER functions. Until they return the
-- new columns, the tracking page cannot tell a COD order from a Pay Now one.
--
-- Three new columns are APPENDED (never reordered) so existing consumers, which
-- read by name, are unaffected:
--   payment_type, refunded_total, manually_confirmed_at
--
-- get_order_bundle and get_orders_by_email are documented as having an IDENTICAL
-- column shape so the client reuses one OrderBundleRow type — they are changed
-- together here to keep that promise.
--
-- NOT CHANGED: get_order_details (20260623000000). No client code calls it
-- (only get_order_bundle / get_orders_by_email are used by OrderTracking.tsx),
-- and it already predates payment_method_name. Left alone rather than carried
-- forward blind; revisit if something starts consuming it.
--
-- Idempotent; safe to re-run.

-- ===========================================================================
-- 1. get_order_bundle — copied forward from 20260708000000, three columns added.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_order_bundle(TEXT);
CREATE FUNCTION public.get_order_bundle(order_id_input TEXT)
RETURNS TABLE (
  id UUID, order_number TEXT, order_status TEXT, payment_status TEXT, payment_method_name TEXT,
  tracking_number TEXT, shipping_provider TEXT, shipping_note TEXT,
  total_price DECIMAL(10,2), shipping_fee DECIMAL(10,2),
  order_items JSONB, created_at TIMESTAMPTZ, promo_code TEXT, discount_applied DECIMAL(10,2),
  fulfillment_stage TEXT, is_claim BOOLEAN, parent_order_id UUID, group_buy_batch_id UUID, batch_status TEXT,
  paid_total DECIMAL(10,2), balance_due DECIMAL(10,2),
  payment_type TEXT, refunded_total DECIMAL(10,2), manually_confirmed_at TIMESTAMPTZ
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
    gb.fulfillment_stage, o.is_claim, o.parent_order_id, o.group_buy_batch_id, gb.status,
    o.paid_total,
    CASE WHEN o.paid_total IS NOT NULL THEN GREATEST(0, o.total_price - o.paid_total) ELSE 0 END,
    o.payment_type, o.refunded_total, o.manually_confirmed_at
  FROM public.orders o
  LEFT JOIN public.group_buy_batches gb ON gb.id = o.group_buy_batch_id
  WHERE o.id = v_root OR o.parent_order_id = v_root
  ORDER BY o.is_claim, o.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_bundle(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_bundle(TEXT) TO anon, authenticated;

-- ===========================================================================
-- 2. get_orders_by_email — copied forward from 20260712000000, same 3 columns.
--    See that migration's header for the accepted enumerability trade-off.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_orders_by_email(TEXT);
CREATE FUNCTION public.get_orders_by_email(email_input TEXT)
RETURNS TABLE (
  id UUID, order_number TEXT, order_status TEXT, payment_status TEXT, payment_method_name TEXT,
  tracking_number TEXT, shipping_provider TEXT, shipping_note TEXT,
  total_price DECIMAL(10,2), shipping_fee DECIMAL(10,2),
  order_items JSONB, created_at TIMESTAMPTZ, promo_code TEXT, discount_applied DECIMAL(10,2),
  fulfillment_stage TEXT, is_claim BOOLEAN, parent_order_id UUID, group_buy_batch_id UUID, batch_status TEXT,
  paid_total DECIMAL(10,2), balance_due DECIMAL(10,2),
  payment_type TEXT, refunded_total DECIMAL(10,2), manually_confirmed_at TIMESTAMPTZ
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
    CASE WHEN o.paid_total IS NOT NULL THEN GREATEST(0, o.total_price - o.paid_total) ELSE 0 END,
    o.payment_type, o.refunded_total, o.manually_confirmed_at
  FROM public.orders o
  JOIN roots r ON (o.id = r.root_id OR o.parent_order_id = r.root_id)
  LEFT JOIN public.group_buy_batches gb ON gb.id = o.group_buy_batch_id
  ORDER BY r.root_created DESC, o.is_claim, o.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_orders_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_by_email(TEXT) TO anon, authenticated;

-- ===========================================================================
-- 3. submit_additional_payment — refuse receipts against a refunded order.
--
--    Copied forward from 20260708000000 with one extra guard. Without it a
--    refunded order could be pushed back to 'submitted', losing the refund
--    state. A COD order never reaches here (paid_total stays NULL, so
--    balance_due is 0 and the existing guard already rejects it).
-- ===========================================================================
DROP FUNCTION IF EXISTS public.submit_additional_payment(TEXT, TEXT);
CREATE FUNCTION public.submit_additional_payment(order_id_input TEXT, proof_url TEXT)
RETURNS TABLE (order_number TEXT, payment_status TEXT, balance_due DECIMAL(10,2))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_balance DECIMAL(10,2);
  v_status TEXT;
BEGIN
  IF proof_url IS NULL OR btrim(proof_url) = '' THEN
    RAISE EXCEPTION 'A payment receipt is required.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT o.id, o.payment_status,
    CASE WHEN o.paid_total IS NOT NULL THEN GREATEST(0, o.total_price - o.paid_total) ELSE 0 END
  INTO v_id, v_status, v_balance
  FROM public.orders o
  WHERE o.order_number ILIKE btrim(order_id_input)
  ORDER BY o.parent_order_id NULLS FIRST
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status IN ('refunded', 'partially_refunded') THEN
    RAISE EXCEPTION 'This order has been refunded. Please contact support.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_balance <= 0 THEN
    RAISE EXCEPTION 'This order has no additional payment due.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.orders o
  SET additional_payment_proof_url = btrim(proof_url),
      payment_status = 'submitted',
      updated_at = now()
  WHERE o.id = v_id;

  RETURN QUERY
  SELECT o.order_number, o.payment_status,
    CASE WHEN o.paid_total IS NOT NULL THEN GREATEST(0, o.total_price - o.paid_total) ELSE 0 END
  FROM public.orders o
  WHERE o.id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_additional_payment(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_additional_payment(TEXT, TEXT) TO anon, authenticated;

-- ===========================================================================
-- 4. claim_group_buy_leftover — a claim inherits its parent's payment_type.
--
--    Copied forward from 20260624000300 with payment_type added to the INSERT.
--    Without it the column default ('pay_now') would apply, so a COD customer's
--    leftover claim would silently become a Pay Now order that nobody ever pays.
--    The claim is exempt from the "Pay Now needs a method" rule in
--    enforce_payment_type_on_order (is_claim carve-out) because it settles
--    against the parent order, not a method of its own.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.claim_group_buy_leftover(
  p_order_number        TEXT,
  p_email               TEXT,
  p_items               JSONB,
  p_payment_proof_url   TEXT DEFAULT NULL,
  p_payment_method_id   TEXT DEFAULT NULL,
  p_payment_method_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent   public.orders%ROWTYPE;
  v_batch    public.group_buy_batches%ROWTYPE;
  rec        RECORD;
  v_pid      UUID;
  v_qty      NUMERIC;
  v_product  public.products%ROWTYPE;
  v_price    NUMERIC;
  v_cap      INTEGER;
  v_reserved NUMERIC;
  v_items    JSONB := '[]'::jsonb;
  v_subtotal NUMERIC := 0;
  v_new_id   UUID;
  v_new_num  TEXT;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items to claim.' USING ERRCODE = 'check_violation';
  END IF;

  -- Authenticate by (order_number + email); a CANCELLED order cannot claim back
  -- the units its own cancellation freed.
  SELECT * INTO v_parent
  FROM public.orders
  WHERE order_number = btrim(p_order_number)
    AND lower(customer_email) = lower(btrim(coalesce(p_email, '')))
    AND parent_order_id IS NULL
    AND order_status <> 'cancelled'
  LIMIT 1;

  IF v_parent.id IS NULL THEN
    RAISE EXCEPTION 'We could not match that order number and email.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_batch FROM public.group_buy_batches WHERE id = v_parent.group_buy_batch_id;
  IF v_batch.id IS NULL OR v_batch.status <> 'finalizing' THEN
    RAISE EXCEPTION 'This batch is not accepting leftover claims right now.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('group_buy_cap:' || v_batch.id::text));

  -- Aggregate requested quantities PER PRODUCT first, so a single claim listing
  -- the same product twice cannot slip past the cap.
  FOR rec IN
    SELECT (elem->>'product_id')::uuid AS pid,
           SUM((elem->>'quantity')::numeric) AS qty
    FROM jsonb_array_elements(p_items) elem
    WHERE (elem->>'product_id') IS NOT NULL
    GROUP BY (elem->>'product_id')::uuid
  LOOP
    v_pid := rec.pid;
    v_qty := rec.qty;

    IF v_qty <= 0 OR v_qty <> floor(v_qty) THEN
      RAISE EXCEPTION 'Claim quantity must be a whole number greater than 0.' USING ERRCODE = 'check_violation';
    END IF;

    SELECT cap_quantity INTO v_cap FROM public.group_buy_caps
     WHERE batch_id = v_batch.id AND product_id = v_pid;
    IF v_cap IS NULL THEN
      RAISE EXCEPTION 'That product is not part of this group buy.' USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(SUM((elem->>'quantity')::numeric), 0) INTO v_reserved
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.order_items) elem
    WHERE o.group_buy_batch_id = v_batch.id
      AND o.order_status <> 'cancelled'
      AND (elem->>'product_id') = v_pid::text;

    IF v_qty > (v_cap - v_reserved) THEN
      RAISE EXCEPTION 'Only % left to claim for that item.', GREATEST(0, v_cap - v_reserved)::int
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_pid;
    v_price := CASE
      WHEN v_product.discount_active AND v_product.discount_price IS NOT NULL
           AND (v_product.discount_start_date IS NULL OR v_product.discount_start_date <= NOW())
           AND (v_product.discount_end_date IS NULL OR v_product.discount_end_date >= NOW())
      THEN v_product.discount_price ELSE v_product.base_price END;

    v_items := v_items || jsonb_build_object(
      'product_id', v_pid, 'product_name', v_product.name,
      'variation_id', NULL, 'variation_name', NULL,
      'quantity', v_qty, 'price', v_price, 'total', v_price * v_qty,
      'purity_percentage', v_product.purity_percentage
    );
    v_subtotal := v_subtotal + (v_price * v_qty);
  END LOOP;

  v_new_num := public.next_order_number();

  INSERT INTO public.orders (
    customer_name, customer_email, customer_phone, contact_method,
    shipping_address, shipping_barangay, shipping_city, shipping_state,
    shipping_zip_code, shipping_country, shipping_region, shipping_location,
    order_items, subtotal, total_price, shipping_fee,
    payment_method_id, payment_method_name, payment_proof_url, payment_status,
    order_status, order_number, group_buy_batch_id, parent_order_id, is_claim,
    payment_type
  ) VALUES (
    v_parent.customer_name, v_parent.customer_email, v_parent.customer_phone, v_parent.contact_method,
    v_parent.shipping_address, v_parent.shipping_barangay, v_parent.shipping_city, v_parent.shipping_state,
    v_parent.shipping_zip_code, v_parent.shipping_country, v_parent.shipping_region, v_parent.shipping_location,
    v_items, v_subtotal, v_subtotal, 0,
    p_payment_method_id, p_payment_method_name, p_payment_proof_url, 'pending',
    'new', v_new_num, v_batch.id, v_parent.id, true,
    v_parent.payment_type
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'order_id', v_new_id, 'order_number', v_new_num,
    'parent_order_number', v_parent.order_number, 'total', v_subtotal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_group_buy_leftover(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_group_buy_leftover(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) TO anon, authenticated;
