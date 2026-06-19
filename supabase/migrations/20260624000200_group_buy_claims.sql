-- Pure Peps — Group Buy leftover claims.
--
-- During FINALIZING, capped units freed by cancelled / never-confirmed orders
-- become claimable by EXISTING customers ("I'll take the remaining 2 tirz").
-- A claim is a NEW order linked to the customer's original order via
-- parent_order_id, sharing one tracking lookup (get_order_bundle). It carries
-- its own payment proof and is admin-confirmed like any other order.
--
-- Security model mirrors the rest of the data plane: anon never reads orders
-- directly; the claim path is a single SECURITY DEFINER RPC that authenticates
-- the customer by (order_number + email), re-checks the cap under the same
-- advisory lock the checkout trigger uses, and inserts the linked order. The
-- public remaining/bundle RPCs expose only non-PII aggregates / the customer's
-- own bundle. Idempotent.

-- ===========================================================================
-- 1. Linking columns.
-- ===========================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_claim BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS orders_parent_order_id_idx ON public.orders (parent_order_id);

-- ===========================================================================
-- 2. Checkout trigger — claim-aware + cancellation frees units.
--    Normal checkout still requires an OPEN batch and is server-tagged to it.
--    Claim inserts (is_claim) target the FINALIZING batch chosen by the claim
--    RPC; the cap math now EXCLUDES cancelled orders so freed units reopen.
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
  rec RECORD;
BEGIN
  IF NEW.is_claim THEN
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
      RAISE EXCEPTION 'No active group buy is open. Ordering is currently closed.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Server-authoritative: never trust a client-supplied batch id.
    NEW.group_buy_batch_id := v_batch_id;
  END IF;

  -- Every line item must reference a real catalog product (cap math keys on it).
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.order_items) elem
    WHERE NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id::text = (elem->>'product_id')
    )
  ) THEN
    RAISE EXCEPTION 'Order contains an item with an invalid or missing product reference.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialize cap checks per batch (TOCTOU). Released at transaction end.
  PERFORM pg_advisory_xact_lock(hashtext('group_buy_cap:' || v_batch_id::text));

  FOR rec IN
    SELECT
      c.cap_quantity,
      COALESCE((
        SELECT SUM((elem->>'quantity')::numeric)
        FROM public.orders o
        CROSS JOIN LATERAL jsonb_array_elements(o.order_items) elem
        WHERE o.group_buy_batch_id = v_batch_id
          AND o.order_status <> 'cancelled'
          AND (elem->>'product_id') = c.product_id::text
      ), 0) AS existing_total,
      COALESCE((
        SELECT SUM((elem->>'quantity')::numeric)
        FROM jsonb_array_elements(NEW.order_items) elem
        WHERE (elem->>'product_id') = c.product_id::text
      ), 0) AS new_total
    FROM public.group_buy_caps c
    WHERE c.batch_id = v_batch_id
  LOOP
    IF rec.new_total > 0 AND (rec.existing_total + rec.new_total) > rec.cap_quantity THEN
      RAISE EXCEPTION 'Group buy limit reached for one of the items in your order (cap %, already reserved %, you requested %).',
        rec.cap_quantity, rec.existing_total, rec.new_total
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_group_buy_on_order() FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 3. Public remaining RPC — per-capped-product leftover for a FINALIZING batch.
--    PII-free (counts only), so anon may call it from the claim panel.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_group_buy_remaining(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.group_buy_batches%ROWTYPE;
  v_items JSONB;
BEGIN
  SELECT * INTO v_batch FROM public.group_buy_batches WHERE id = p_batch_id;
  IF v_batch.id IS NULL OR v_batch.status <> 'finalizing' THEN
    RETURN jsonb_build_object('batch_status', v_batch.status, 'items', '[]'::jsonb);
  END IF;

  WITH reserved AS (
    SELECT (elem->>'product_id') AS product_id,
           SUM((elem->>'quantity')::numeric) AS qty
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.order_items) elem
    WHERE o.group_buy_batch_id = v_batch.id
      AND o.order_status <> 'cancelled'
    GROUP BY (elem->>'product_id')
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'product_id',   c.product_id,
      'product_name', p.name,
      'cap_quantity', c.cap_quantity,
      'reserved',     COALESCE(r.qty, 0),
      'remaining',    GREATEST(0, c.cap_quantity - COALESCE(r.qty, 0))
    ) ORDER BY p.name NULLS LAST
  )
  INTO v_items
  FROM public.group_buy_caps c
  LEFT JOIN reserved r ON r.product_id = c.product_id::text
  LEFT JOIN public.products p ON p.id = c.product_id
  WHERE c.batch_id = v_batch.id;

  RETURN jsonb_build_object('batch_status', v_batch.status, 'items', COALESCE(v_items, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_group_buy_remaining(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_buy_remaining(UUID) TO anon, authenticated;

-- ===========================================================================
-- 4. Claim RPC — authenticate by (order_number + email), cap-check, link order.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.claim_group_buy_leftover(
  p_order_number        TEXT,
  p_email               TEXT,
  p_items               JSONB,   -- [{ "product_id": uuid, "quantity": int }]
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
  v_item     JSONB;
  v_pid      UUID;
  v_qty      NUMERIC;
  v_product  public.products%ROWTYPE;
  v_price    NUMERIC;
  v_cap      INTEGER;
  v_reserved NUMERIC;
  v_remaining NUMERIC;
  v_items    JSONB := '[]'::jsonb;
  v_subtotal NUMERIC := 0;
  v_new_id   UUID;
  v_new_num  TEXT;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items to claim.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_parent
  FROM public.orders
  WHERE order_number = btrim(p_order_number)
    AND lower(customer_email) = lower(btrim(coalesce(p_email, '')))
    AND parent_order_id IS NULL
  LIMIT 1;

  IF v_parent.id IS NULL THEN
    RAISE EXCEPTION 'We could not match that order number and email.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_batch FROM public.group_buy_batches WHERE id = v_parent.group_buy_batch_id;
  IF v_batch.id IS NULL OR v_batch.status <> 'finalizing' THEN
    RAISE EXCEPTION 'This batch is not accepting leftover claims right now.' USING ERRCODE = 'check_violation';
  END IF;

  -- Same advisory lock the checkout trigger uses, so concurrent claims of the
  -- last units cannot both pass the cap check.
  PERFORM pg_advisory_xact_lock(hashtext('group_buy_cap:' || v_batch.id::text));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);

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

    v_remaining := v_cap - v_reserved;
    IF v_qty > v_remaining THEN
      RAISE EXCEPTION 'Only % left to claim for that item.', GREATEST(0, v_remaining)::int
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_pid;
    v_price := CASE
      WHEN v_product.discount_active AND v_product.discount_price IS NOT NULL
           AND (v_product.discount_start_date IS NULL OR v_product.discount_start_date <= NOW())
           AND (v_product.discount_end_date IS NULL OR v_product.discount_end_date >= NOW())
      THEN v_product.discount_price ELSE v_product.base_price END;

    v_items := v_items || jsonb_build_object(
      'product_id',        v_pid,
      'product_name',      v_product.name,
      'variation_id',      NULL,
      'variation_name',    NULL,
      'quantity',          v_qty,
      'price',             v_price,
      'total',             v_price * v_qty,
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
    order_status, order_number, group_buy_batch_id, parent_order_id, is_claim
  ) VALUES (
    v_parent.customer_name, v_parent.customer_email, v_parent.customer_phone, v_parent.contact_method,
    v_parent.shipping_address, v_parent.shipping_barangay, v_parent.shipping_city, v_parent.shipping_state,
    v_parent.shipping_zip_code, v_parent.shipping_country, v_parent.shipping_region, v_parent.shipping_location,
    v_items, v_subtotal, v_subtotal, 0,
    p_payment_method_id, p_payment_method_name, p_payment_proof_url, 'pending',
    'new', v_new_num, v_batch.id, v_parent.id, true
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'order_id',     v_new_id,
    'order_number', v_new_num,
    'parent_order_number', v_parent.order_number,
    'total',        v_subtotal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_group_buy_leftover(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_group_buy_leftover(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ===========================================================================
-- 5. Bundle tracking RPC — root order + its claim children under one lookup.
--    Customer tracks by their original number; the bundle returns add-ons too.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_order_bundle(order_id_input TEXT)
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
  fulfillment_stage TEXT,
  is_claim BOOLEAN,
  parent_order_id UUID,
  group_buy_batch_id UUID,
  batch_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root UUID;
BEGIN
  SELECT COALESCE(o.parent_order_id, o.id) INTO v_root
  FROM public.orders o
  WHERE o.order_number ILIKE order_id_input
     OR o.id::text ILIKE order_id_input || '%'
  ORDER BY o.parent_order_id NULLS FIRST
  LIMIT 1;

  IF v_root IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.order_number, o.order_status, o.payment_status, o.tracking_number,
    o.shipping_provider, o.shipping_note, o.total_price, o.shipping_fee,
    o.order_items, o.created_at, o.promo_code, o.discount_applied,
    gb.fulfillment_stage, o.is_claim, o.parent_order_id, o.group_buy_batch_id, gb.status
  FROM public.orders o
  LEFT JOIN public.group_buy_batches gb ON gb.id = o.group_buy_batch_id
  WHERE o.id = v_root OR o.parent_order_id = v_root
  ORDER BY o.is_claim, o.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_bundle(TEXT) TO public;
