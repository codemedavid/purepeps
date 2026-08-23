-- Pure Peps — A failed or unpaid Pay Now order is not a confirmed order.
--
-- get_group_buy_progress counted a unit as CONFIRMED purely on order_status:
--
--     FILTER (WHERE o.order_status NOT IN ('cancelled', 'new'))
--
-- That was safe while every order was prepaid with a receipt attached. With COD
-- and explicit failed/refunded payment states it is not: an admin advancing a
-- Pay Now order whose payment FAILED would silently count it toward batch
-- demand and burn a cap slot that nobody has paid for.
--
-- Confirmed now means: the order has moved past 'new', is not cancelled, AND
-- one of the following is true —
--   * it is COD and the cash has not failed or been handed back (unpaid by
--     design; confirming it IS the admin taking the risk),
--   * the payment is verified paid, or
--   * an admin manually confirmed it despite the payment state, which is
--     recorded in manually_confirmed_at (see 20260824000000).
--
-- total_quantity is deliberately UNCHANGED — it still means "all non-cancelled
-- units", so storefront cap display and the pending split (total - confirmed)
-- keep their existing meaning. Only the confirmed half tightens.
--
-- Copied forward verbatim from 20260718000000 (view-only mode) with ONLY the
-- confirmed_quantity FILTER changed, per the convention in this directory.
--
-- Idempotent; safe to re-run.

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

  -- confirmed-quantity-version: payment-aware-v3
  WITH order_totals AS (
    SELECT
      (elem->>'product_id')                                                        AS product_id,
      MAX(elem->>'product_name')                                                   AS product_name,
      COALESCE(SUM((elem->>'quantity')::numeric)
               FILTER (WHERE o.order_status <> 'cancelled'), 0)                     AS total_quantity,
      COALESCE(SUM((elem->>'quantity')::numeric)
               FILTER (WHERE o.order_status NOT IN ('cancelled', 'new')
                         AND (o.manually_confirmed_at IS NOT NULL
                              OR (o.payment_status NOT IN
                                    ('failed', 'refunded', 'partially_refunded')
                                  AND (o.payment_type = 'cod'
                                       OR o.payment_status = 'paid'
                                       -- Balance receipt under review on an
                                       -- order that WAS paid (paid_total set):
                                       -- submit_additional_payment moves it to
                                       -- 'submitted', which must not silently
                                       -- drop it out of confirmed demand.
                                       OR (o.payment_status = 'submitted'
                                           AND o.paid_total IS NOT NULL))))), 0)  AS confirmed_quantity,
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

-- ===========================================================================
-- Staleness guard.
--
-- Several older migrations in this directory also CREATE OR REPLACE
-- get_group_buy_progress. Re-applying any of them silently reverts the
-- confirmed-order rule above and unpaid orders start counting again — with no
-- error and no visible symptom until batch caps are already wrong.
--
--    Run this SELECT on its own any time to check the DEPLOYED function:
--
--      SELECT pg_get_functiondef('public.get_group_buy_progress(uuid)'::regprocedure)
--             LIKE '%confirmed-quantity-version: payment-aware-v3%' AS is_payment_aware;
--
--    FALSE means an older migration file was re-applied over this one.
-- ===========================================================================
DO $verify$
BEGIN
  IF pg_get_functiondef('public.get_group_buy_progress(uuid)'::regprocedure)
     NOT LIKE '%confirmed-quantity-version: payment-aware-v3%' THEN
    RAISE EXCEPTION
      'get_group_buy_progress is still a stale, payment-blind definition. Re-apply this migration.';
  END IF;
END
$verify$;
