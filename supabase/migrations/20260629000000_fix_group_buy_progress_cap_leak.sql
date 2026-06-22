-- ===========================================================================
-- Fix: get_group_buy_progress leaked caps from OTHER batches.
--
-- The previous version FULL OUTER JOINed the entire public.group_buy_caps
-- table, with the batch filter living only in the JOIN's ON clause. In a FULL
-- OUTER JOIN the ON clause governs matching, not membership — so every cap row
-- from every OTHER batch entered the result as an unmatched right-side row.
--
-- Symptom: a product ordered in the open batch but capped in a *different*
-- batch split into two rows — the real order row (correct total, cap NULL) and
-- a phantom row carrying the other batch's cap (total 0). The admin "Orders per
-- item" table rendered the phantom (e.g. Total Qty 0, Cap 3, "3 of 3") instead
-- of the real total, and the storefront saw foreign caps on open-batch items.
--
-- Fix: pre-filter caps to the current batch in a CTE so only this batch's caps
-- can ever enter the FULL OUTER JOIN. Counting/aggregation logic is unchanged:
-- totals still sum every non-cancelled order (including unconfirmed), cancelled
-- units are still surfaced separately and freed back into remaining capacity.
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
  -- Only THIS batch's caps may enter the join below. Filtering here (not in the
  -- FULL OUTER JOIN's ON clause) is what keeps foreign-batch caps out.
  batch_caps AS (
    SELECT product_id, cap_quantity
    FROM public.group_buy_caps
    WHERE batch_id = v_batch.id
  ),
  combined AS (
    SELECT
      COALESCE(ot.product_id, c.product_id::text)       AS product_id,
      COALESCE(ot.product_name, p.name)                 AS product_name,
      COALESCE(ot.total_quantity, 0)                    AS total_quantity,
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
