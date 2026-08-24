-- ===========================================================================
-- Pure Peps — surface a customer's own Ligwak lines in their Order History.
--
-- A customer whose vials fell outside a complete kit must be able to see it
-- without emailing anyone: what was affected, how much of their order still
-- ships, what is coming back, and where that refund stands.
--
-- WHY ALL THREE FUNCTIONS ARE REWRITTEN
-- order_history_rows is the shared row builder; the two lookups declare the
-- same RETURNS TABLE and do `SELECT * FROM order_history_rows(...)`. Adding a
-- column to one without the others is a signature mismatch at runtime, so all
-- three are copied forward verbatim from 20260825000100 with ONLY the new
-- `ligwak` column added, per the convention in this directory.
--
-- THE PRIVACY BOUNDARY
-- ligwak_records is admin-only under RLS and carries the admin's working notes
-- on a refund. This function is SECURITY DEFINER, so it reads straight past
-- that policy — which makes the SELECT list itself the filter. It emits product,
-- quantities, amount, status and reference, and NOTHING ELSE. admin_notes, the
-- snapshotted contact details and the audit trail are deliberately absent, and
-- the subquery is scoped to `lr.order_id = o.id` so a lookup can only ever
-- return the caller's own rows.
--
-- The two lookups keep their existing access proof unchanged: by-email returns
-- only that address's orders, and by-number still requires the matching email.
--
-- Idempotent; safe to re-run.
-- ===========================================================================

DROP FUNCTION IF EXISTS public.order_history_rows(UUID[]);
CREATE FUNCTION public.order_history_rows(p_root_ids UUID[])
RETURNS TABLE (
  id UUID, order_number TEXT, created_at TIMESTAMPTZ,
  customer_name TEXT, customer_email TEXT, customer_phone TEXT, contact_method TEXT,
  shipping_address TEXT, shipping_barangay TEXT, shipping_city TEXT, shipping_state TEXT,
  shipping_zip_code TEXT, shipping_country TEXT, shipping_location TEXT,
  shipping_provider TEXT, shipping_note TEXT, tracking_number TEXT,
  selected_sticker_name TEXT, notes TEXT,
  group_buy_batch_id UUID, batch_name TEXT, batch_number BIGINT, batch_status TEXT,
  fulfillment_stage TEXT,
  order_items JSONB,
  total_price DECIMAL(10,2), shipping_fee DECIMAL(10,2),
  discount_applied DECIMAL(10,2), promo_code TEXT,
  paid_total DECIMAL(10,2), balance_due DECIMAL(10,2), refunded_total DECIMAL(10,2),
  payment_type TEXT, payment_method_name TEXT, payment_status TEXT, order_status TEXT,
  status_events JSONB,
  is_claim BOOLEAN, parent_order_id UUID,
  ligwak JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id, o.order_number, o.created_at,
    o.customer_name, o.customer_email, o.customer_phone, o.contact_method,
    o.shipping_address, o.shipping_barangay, o.shipping_city, o.shipping_state,
    o.shipping_zip_code, o.shipping_country, o.shipping_location,
    o.shipping_provider, o.shipping_note, o.tracking_number,
    o.selected_sticker_name, o.notes,
    o.group_buy_batch_id, gb.name, gb.batch_number, gb.status,
    gb.fulfillment_stage,

    -- Line items, each carrying its exact strength in mg. quantity_mg lives on
    -- product_variations and was never copied into order_items, so historical
    -- orders recover it by join. A value already stored on the item WINS: it is
    -- what was true when the order was placed, and it survives the variation
    -- being edited or deleted afterwards.
    (
      SELECT COALESCE(jsonb_agg(
        li.elem || jsonb_build_object(
          'quantity_mg',
          COALESCE(NULLIF(li.elem->'quantity_mg', 'null'::jsonb), to_jsonb(pv.quantity_mg))
        )
        ORDER BY li.idx
      ), '[]'::jsonb)
      FROM jsonb_array_elements(o.order_items) WITH ORDINALITY AS li(elem, idx)
      LEFT JOIN public.product_variations pv
        ON pv.id = NULLIF(li.elem->>'variation_id', '')::uuid
    ),

    o.total_price, o.shipping_fee,
    o.discount_applied, o.promo_code,
    o.paid_total,
    CASE WHEN o.paid_total IS NOT NULL THEN GREATEST(0, o.total_price - o.paid_total) ELSE 0 END,
    o.refunded_total,
    o.payment_type, o.payment_method_name, o.payment_status, o.order_status,

    -- One timeline from two logs: this order's own transitions, plus the shared
    -- international-leg stages of the batch it rides in. The batch log is stored
    -- once per batch (20260825000000) and fanned out here at read time.
    (
      SELECT COALESCE(jsonb_agg(merged.event ORDER BY merged.occurred_at), '[]'::jsonb)
      FROM (
        SELECT ose.occurred_at,
               jsonb_build_object(
                 'event_type', ose.event_type,
                 'from_value', ose.from_value,
                 'to_value',   ose.to_value,
                 'occurred_at', ose.occurred_at
               ) AS event
        FROM public.order_status_events ose
        WHERE ose.order_id = o.id
        UNION ALL
        SELECT gse.occurred_at,
               jsonb_build_object(
                 'event_type', 'fulfillment_stage',
                 'from_value', gse.from_value,
                 'to_value',   gse.to_value,
                 'occurred_at', gse.occurred_at
               )
        FROM public.group_buy_stage_events gse
        WHERE gse.batch_id = o.group_buy_batch_id
      ) merged
    ),

    o.is_claim, o.parent_order_id,

    -- The customer's own ligwak lines, if any. PUBLIC FIELDS ONLY: what was
    -- affected, what is coming back, and where the refund stands. The admin's
    -- notes, the audit trail and every other customer's details stay behind the
    -- admin-only RLS on ligwak_records.
    (
      SELECT COALESCE(jsonb_agg(
               jsonb_build_object(
                 'product_name',       lr.product_name,
                 'variation_name',     lr.variation_name,
                 'quantity_mg',        lr.quantity_mg,
                 'total_quantity',     lr.total_quantity,
                 'confirmed_quantity', lr.confirmed_quantity,
                 'ligwak_quantity',    lr.ligwak_quantity,
                 'refund_amount',      lr.refund_amount,
                 'refund_status',      lr.refund_status,
                 'refund_reference',   lr.refund_reference,
                 'refunded_at',        lr.refunded_at
               ) ORDER BY lr.product_name NULLS LAST, lr.variation_name NULLS LAST
             ), '[]'::jsonb)
      FROM public.ligwak_records lr
      WHERE lr.order_id = o.id
    )
  FROM public.orders o
  LEFT JOIN public.group_buy_batches gb ON gb.id = o.group_buy_batch_id
  WHERE o.id = ANY(p_root_ids) OR o.parent_order_id = ANY(p_root_ids)
  ORDER BY o.created_at DESC, o.is_claim;
END;
$$;

REVOKE ALL ON FUNCTION public.order_history_rows(UUID[]) FROM PUBLIC, anon;

-- ===========================================================================
-- 2. By email — the customer's own recent bundles, newest first.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_order_history_by_email(TEXT);
CREATE FUNCTION public.get_order_history_by_email(p_email TEXT)
RETURNS TABLE (
  id UUID, order_number TEXT, created_at TIMESTAMPTZ,
  customer_name TEXT, customer_email TEXT, customer_phone TEXT, contact_method TEXT,
  shipping_address TEXT, shipping_barangay TEXT, shipping_city TEXT, shipping_state TEXT,
  shipping_zip_code TEXT, shipping_country TEXT, shipping_location TEXT,
  shipping_provider TEXT, shipping_note TEXT, tracking_number TEXT,
  selected_sticker_name TEXT, notes TEXT,
  group_buy_batch_id UUID, batch_name TEXT, batch_number BIGINT, batch_status TEXT,
  fulfillment_stage TEXT,
  order_items JSONB,
  total_price DECIMAL(10,2), shipping_fee DECIMAL(10,2),
  discount_applied DECIMAL(10,2), promo_code TEXT,
  paid_total DECIMAL(10,2), balance_due DECIMAL(10,2), refunded_total DECIMAL(10,2),
  payment_type TEXT, payment_method_name TEXT, payment_status TEXT, order_status TEXT,
  status_events JSONB,
  is_claim BOOLEAN, parent_order_id UUID,
  ligwak JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_roots UUID[];
BEGIN
  -- Normalized the same way checkout stores it (enforce_group_buy_on_order).
  v_email := lower(btrim(coalesce(p_email, '')));
  IF v_email = '' THEN
    RETURN;
  END IF;

  SELECT array_agg(r.id) INTO v_roots
  FROM (
    SELECT o.id
    FROM public.orders o
    WHERE o.is_claim = false
      AND o.parent_order_id IS NULL
      AND lower(btrim(o.customer_email)) = v_email
    ORDER BY o.created_at DESC
    LIMIT 25
  ) r;

  IF v_roots IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.order_history_rows(v_roots);
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_history_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_history_by_email(TEXT) TO anon, authenticated;

-- ===========================================================================
-- 3. By order number — REQUIRES the matching email. See the header.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_order_history_by_number(TEXT, TEXT);
CREATE FUNCTION public.get_order_history_by_number(p_order_number TEXT, p_email TEXT)
RETURNS TABLE (
  id UUID, order_number TEXT, created_at TIMESTAMPTZ,
  customer_name TEXT, customer_email TEXT, customer_phone TEXT, contact_method TEXT,
  shipping_address TEXT, shipping_barangay TEXT, shipping_city TEXT, shipping_state TEXT,
  shipping_zip_code TEXT, shipping_country TEXT, shipping_location TEXT,
  shipping_provider TEXT, shipping_note TEXT, tracking_number TEXT,
  selected_sticker_name TEXT, notes TEXT,
  group_buy_batch_id UUID, batch_name TEXT, batch_number BIGINT, batch_status TEXT,
  fulfillment_stage TEXT,
  order_items JSONB,
  total_price DECIMAL(10,2), shipping_fee DECIMAL(10,2),
  discount_applied DECIMAL(10,2), promo_code TEXT,
  paid_total DECIMAL(10,2), balance_due DECIMAL(10,2), refunded_total DECIMAL(10,2),
  payment_type TEXT, payment_method_name TEXT, payment_status TEXT, order_status TEXT,
  status_events JSONB,
  is_claim BOOLEAN, parent_order_id UUID,
  ligwak JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email  TEXT;
  v_number TEXT;
  v_root   UUID;
BEGIN
  v_email  := lower(btrim(coalesce(p_email, '')));
  v_number := btrim(coalesce(p_order_number, ''));

  -- Both factors required. Order numbers come from a monotonic sequence, so the
  -- number alone is guessable; without this the function would hand a sweeping
  -- script every customer's address.
  IF v_email = '' OR v_number = '' THEN
    RETURN;
  END IF;

  SELECT COALESCE(o.parent_order_id, o.id) INTO v_root
  FROM public.orders o
  WHERE o.order_number ILIKE v_number
    AND lower(btrim(o.customer_email)) = v_email
  ORDER BY o.parent_order_id NULLS FIRST
  LIMIT 1;

  IF v_root IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.order_history_rows(ARRAY[v_root]);
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_history_by_number(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_history_by_number(TEXT, TEXT) TO anon, authenticated;
