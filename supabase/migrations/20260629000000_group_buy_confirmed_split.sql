-- ===========================================================================
-- Group buy demand visibility: split per-product non-cancelled totals into
-- CONFIRMED vs PENDING so the admin overview can show how many units are
-- already ordered but still awaiting confirmation.
--
--   * confirmed_quantity = non-cancelled units whose order has moved past 'new'
--     (i.e. order_status NOT IN ('cancelled', 'new')).
--   * pending units are derived client-side as total_quantity - confirmed_quantity,
--     so total_quantity keeps its existing meaning (all non-cancelled units).
--
-- Purely additive: every existing field in the envelope is unchanged, so the
-- storefront cap display keeps working untouched. Idempotent; safe to re-run.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_group_buy_progress(p_batch_id UUID DEFAULT NULL)
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
  IF p_batch_id IS NULL THEN
    SELECT * INTO v_batch
    FROM public.group_buy_batches
    WHERE status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
  ELSE
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Not authorized to read this batch.';
    END IF;
    SELECT * INTO v_batch FROM public.group_buy_batches WHERE id = p_batch_id;
  END IF;

  IF v_batch.id IS NULL THEN
    RETURN jsonb_build_object('batch', NULL, 'items', '[]'::jsonb);
  END IF;

  WITH order_totals AS (
    SELECT
      (elem->>'product_id')                                                        AS product_id,
      MAX(elem->>'product_name')                                                   AS product_name,
      COALESCE(SUM((elem->>'quantity')::numeric)
               FILTER (WHERE o.order_status <> 'cancelled'), 0)                     AS total_quantity,
      COALESCE(SUM((elem->>'quantity')::numeric)
               FILTER (WHERE o.order_status NOT IN ('cancelled', 'new')), 0)        AS confirmed_quantity,
      COUNT(DISTINCT o.id)
               FILTER (WHERE o.order_status <> 'cancelled')                         AS order_count,
      COALESCE(SUM((elem->>'quantity')::numeric)
               FILTER (WHERE o.order_status = 'cancelled'), 0)                      AS cancelled_quantity
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.order_items) AS elem
    WHERE o.group_buy_batch_id = v_batch.id
      AND (elem->>'product_id') IS NOT NULL
    GROUP BY (elem->>'product_id')
  ),
  batch_caps AS (
    -- Pre-filter to THIS batch's caps. A FULL OUTER JOIN keeps unmatched rows
    -- from BOTH sides, so leaving the batch filter in the ON clause would leak
    -- every other batch's caps in as phantom cap-only rows (duplicate products,
    -- wrong cap fill). Filtering here makes only this batch's caps eligible.
    SELECT product_id, cap_quantity
    FROM public.group_buy_caps
    WHERE batch_id = v_batch.id
  ),
  combined AS (
    SELECT
      COALESCE(ot.product_id, c.product_id::text)       AS product_id,
      COALESCE(ot.product_name, p.name)                 AS product_name,
      COALESCE(ot.total_quantity, 0)                    AS total_quantity,
      COALESCE(ot.confirmed_quantity, 0)                AS confirmed_quantity,
      COALESCE(ot.order_count, 0)                       AS order_count,
      COALESCE(ot.cancelled_quantity, 0)                AS cancelled_quantity,
      c.cap_quantity                                    AS cap_quantity
    FROM order_totals ot
    FULL OUTER JOIN batch_caps c
      ON c.product_id::text = ot.product_id
    LEFT JOIN public.products p
      ON p.id::text = COALESCE(ot.product_id, c.product_id::text)
  )
  SELECT jsonb_agg(
           jsonb_build_object(
             'product_id',         product_id,
             'product_name',       product_name,
             'total_quantity',     total_quantity,
             'confirmed_quantity', confirmed_quantity,
             'order_count',        order_count,
             'cancelled_quantity', cancelled_quantity,
             'cap_quantity',       cap_quantity
           )
           ORDER BY product_name NULLS LAST
         )
  INTO v_items
  FROM combined;

  RETURN jsonb_build_object(
    'batch', jsonb_build_object(
      'id',                v_batch.id,
      'batch_number',      v_batch.batch_number,
      'name',              v_batch.name,
      'status',            v_batch.status,
      'opened_at',         v_batch.opened_at,
      'closed_at',         v_batch.closed_at,
      'finalized_at',      v_batch.finalized_at,
      'fulfillment_stage', v_batch.fulfillment_stage,
      'starts_at',         v_batch.starts_at,
      'ends_at',           v_batch.ends_at
    ),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_group_buy_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_buy_progress(UUID) TO anon, authenticated;
