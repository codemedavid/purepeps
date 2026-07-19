-- Pure Peps — Waive shipping on repeat orders within the same open batch.
--
-- A customer's 2nd+ order in the SAME open group-buy batch ships together with
-- their first order, so it must not be charged shipping a second time. Two parts:
--
--   1. enforce_group_buy_on_order (checkout trigger) already links a repeat order
--      to the customer's first order in the open batch via parent_order_id. This
--      migration also zeroes NEW.shipping_fee whenever that link is made, so the
--      waiver is authoritative server-side regardless of what the client sends.
--
--   2. get_checkout_prefill_by_email additionally returns has_open_batch_order so
--      the storefront can hide the courier/region step and show ₱0 shipping BEFORE
--      the order is placed. The trigger remains the source of truth.
--
-- Idempotent; safe to re-run. Trigger body is unchanged except the two additions
-- marked "repeat-order shipping waiver" / "return has_open_batch_order".

-- ===========================================================================
-- 1. Checkout trigger — zero the shipping fee when linking a repeat order.
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
        -- repeat-order shipping waiver: this order ships with the first, so it is
        -- never charged shipping again, whatever the client submitted.
        NEW.shipping_fee := 0;
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
-- 2. Prefill RPC — also return has_open_batch_order so the client can hide the
--    shipping step and show ₱0 before the order is placed.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_checkout_prefill_by_email(TEXT);
CREATE FUNCTION public.get_checkout_prefill_by_email(email_input TEXT)
RETURNS TABLE (
  customer_name TEXT, customer_phone TEXT, contact_method TEXT,
  shipping_address TEXT, shipping_barangay TEXT, shipping_city TEXT,
  shipping_state TEXT, shipping_zip_code TEXT,
  courier_id TEXT, shipping_location TEXT,
  has_open_batch_order BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Normalize the same way checkout does (see enforce_group_buy_on_order).
  v_email := lower(btrim(coalesce(email_input, '')));
  IF v_email = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- Cast every column to TEXT so the RETURNS TABLE shape is stable regardless of
  -- the underlying column type (courier_id may be uuid; varchar vs text, etc.).
  SELECT o.customer_name::text, o.customer_phone::text, o.contact_method::text,
    o.shipping_address::text, o.shipping_barangay::text, o.shipping_city::text,
    o.shipping_state::text, o.shipping_zip_code::text,
    o.courier_id::text, o.shipping_location::text,
    -- Does this email already have a non-cancelled order in the OPEN batch?
    EXISTS (
      SELECT 1
      FROM public.orders r
      JOIN public.group_buy_batches b ON b.id = r.group_buy_batch_id
      WHERE b.status = 'open'
        AND r.is_claim = false
        AND r.order_status <> 'cancelled'
        AND lower(btrim(r.customer_email)) = v_email
    )
  FROM public.orders o
  WHERE o.is_claim = false
    AND o.parent_order_id IS NULL
    AND o.order_status <> 'cancelled'
    AND lower(btrim(o.customer_email)) = v_email
  ORDER BY o.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkout_prefill_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_checkout_prefill_by_email(TEXT) TO anon, authenticated;
