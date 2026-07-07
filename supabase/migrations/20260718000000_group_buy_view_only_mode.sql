-- ===========================================================================
-- Pure Peps — Group-buy "View-only mode" (per-batch pre-launch gate).
--
-- When a batch has view_only_mode = true, the storefront still SHOWS that
-- batch's products (browsable, detail drawer openable) but Add-to-Cart is
-- disabled everywhere — a pre-launch/preview phase. Flip it off ("allow adding
-- now") to make the catalog orderable. Mirrors pasalo_mode exactly; the only
-- difference is pasalo filters the product list while view-only gates the Add
-- button. Purely additive & idempotent.
--
--   * group_buy_batches.view_only_mode  — NOT NULL boolean, defaults false.
--   * set_group_buy_view_only_mode()    — admin-guarded setter (mirrors
--     set_group_buy_pasalo_mode): SECURITY DEFINER, RETURNS group_buy_batches.
--     NOTE: group_buy_batches has no updated_at column, so we must not touch it.
--   * get_group_buy_progress()          — batch envelope now also carries
--     view_only_mode so the storefront can read it. Rebuilt on the variation-caps
--     version (the latest); only the batch jsonb_build_object gains one line so
--     the per-variation breakdown is preserved unchanged.
-- ===========================================================================

-- 1. Column ----------------------------------------------------------------
ALTER TABLE public.group_buy_batches
  ADD COLUMN IF NOT EXISTS view_only_mode BOOLEAN NOT NULL DEFAULT false;

-- 2. Setter RPC ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_group_buy_view_only_mode(
  p_id      UUID,
  p_enabled BOOLEAN
)
RETURNS public.group_buy_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.group_buy_batches%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to set view-only mode.';
  END IF;

  -- group_buy_batches has no updated_at column, so we must not touch it here
  -- (doing so raises 42703 and 400s the RPC — see the pasalo_mode corrective).
  UPDATE public.group_buy_batches
     SET view_only_mode = COALESCE(p_enabled, false)
   WHERE id = p_id
  RETURNING * INTO v_batch;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Batch % not found.', p_id;
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.set_group_buy_view_only_mode(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_buy_view_only_mode(UUID, BOOLEAN) TO authenticated;

-- 3. Progress RPC — surface view_only_mode in the batch envelope -----------
-- Rebuilt on the variation-caps version (20260716000000): identical item/cap
-- logic and per-variation breakdown; the batch envelope gains one line.
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
  -- Product-level cap (the shared-pool cap). One row per product at most.
  product_cap AS (
    SELECT product_id::text AS product_id, cap_quantity
    FROM public.group_buy_caps
    WHERE batch_id = v_batch.id AND variation_id IS NULL
  ),
  -- Every product that has ANY cap row (product- or variation-level), so a product
  -- with only variation caps and no orders yet still surfaces to the storefront.
  capped_products AS (
    SELECT DISTINCT product_id::text AS product_id
    FROM public.group_buy_caps
    WHERE batch_id = v_batch.id
  ),
  -- Non-cancelled units per (product, variation) for the variation breakdown.
  variation_totals AS (
    SELECT
      (elem->>'product_id')                                                        AS product_id,
      (elem->>'variation_id')                                                      AS variation_id,
      MAX(elem->>'variation_name')                                                 AS variation_name,
      COALESCE(SUM((elem->>'quantity')::numeric)
               FILTER (WHERE o.order_status <> 'cancelled'), 0)                     AS total_quantity
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.order_items) AS elem
    WHERE o.group_buy_batch_id = v_batch.id
      AND (elem->>'product_id') IS NOT NULL
      AND (elem->>'variation_id') IS NOT NULL
    GROUP BY (elem->>'product_id'), (elem->>'variation_id')
  ),
  variation_caps AS (
    SELECT product_id::text AS product_id, variation_id::text AS variation_id, cap_quantity
    FROM public.group_buy_caps
    WHERE batch_id = v_batch.id AND variation_id IS NOT NULL
  ),
  variation_combined AS (
    SELECT
      COALESCE(vt.product_id, vc.product_id)             AS product_id,
      COALESCE(vt.variation_id, vc.variation_id)         AS variation_id,
      COALESCE(vt.variation_name, pv.name)               AS variation_name,
      COALESCE(vt.total_quantity, 0)                     AS total_quantity,
      vc.cap_quantity                                    AS cap_quantity
    FROM variation_totals vt
    FULL OUTER JOIN variation_caps vc
      ON vc.product_id = vt.product_id AND vc.variation_id = vt.variation_id
    LEFT JOIN public.product_variations pv
      ON pv.id::text = COALESCE(vt.variation_id, vc.variation_id)
  ),
  variations_agg AS (
    SELECT
      product_id,
      jsonb_agg(
        jsonb_build_object(
          'variation_id',   variation_id,
          'variation_name', variation_name,
          'total_quantity', total_quantity,
          'cap_quantity',   cap_quantity
        )
        ORDER BY variation_name NULLS LAST
      ) AS variations
    FROM variation_combined
    GROUP BY product_id
  ),
  combined AS (
    SELECT
      COALESCE(ot.product_id, cp.product_id)            AS product_id,
      COALESCE(ot.product_name, p.name)                 AS product_name,
      COALESCE(ot.total_quantity, 0)                    AS total_quantity,
      COALESCE(ot.confirmed_quantity, 0)                AS confirmed_quantity,
      COALESCE(ot.order_count, 0)                       AS order_count,
      COALESCE(ot.cancelled_quantity, 0)                AS cancelled_quantity,
      pc.cap_quantity                                   AS cap_quantity,
      COALESCE(va.variations, '[]'::jsonb)              AS variations
    FROM order_totals ot
    FULL OUTER JOIN capped_products cp
      ON cp.product_id = ot.product_id
    LEFT JOIN product_cap pc
      ON pc.product_id = COALESCE(ot.product_id, cp.product_id)
    LEFT JOIN public.products p
      ON p.id::text = COALESCE(ot.product_id, cp.product_id)
    LEFT JOIN variations_agg va
      ON va.product_id = COALESCE(ot.product_id, cp.product_id)
  )
  SELECT jsonb_agg(
           jsonb_build_object(
             'product_id',         product_id,
             'product_name',       product_name,
             'total_quantity',     total_quantity,
             'confirmed_quantity', confirmed_quantity,
             'order_count',        order_count,
             'cancelled_quantity', cancelled_quantity,
             'cap_quantity',       cap_quantity,
             'variations',         variations
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
      'ends_at',           v_batch.ends_at,
      'pasalo_mode',       v_batch.pasalo_mode,
      'view_only_mode',    v_batch.view_only_mode
    ),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_group_buy_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_buy_progress(UUID) TO anon, authenticated;
