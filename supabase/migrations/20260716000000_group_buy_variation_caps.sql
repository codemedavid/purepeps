-- Pure Peps — Per-variation group-buy caps.
--
-- Extends the existing per-product cap model down to the variation level. A cap row
-- may now target a specific variation (variation_id NOT NULL) or the whole product
-- (variation_id NULL, the pre-existing behaviour). Resolution rule:
--
--   * A variation with its OWN cap is governed by that cap (it OVERRIDES the product
--     cap for that variation).
--   * Variations WITHOUT their own cap fall back to the product-level cap, which they
--     share as a single pool: (product cap − units of the variation-capped variations).
--   * Neither set → unlimited.
--
-- Backward compatible: a product-level cap with no variation caps behaves exactly as
-- before — a shared total across all the product's variations. Existing group_buy_caps
-- rows (variation_id NULL) are untouched.
--
-- Mirrors the pure helpers in src/utils/groupBuy.ts (remainingForVariation), which
-- drive UX; this trigger remains the authoritative backstop. Idempotent where
-- practical; safe to run in the Supabase SQL editor.

-- ===========================================================================
-- 1. Schema — add variation_id + swap the uniqueness guarantee.
-- ===========================================================================
ALTER TABLE public.group_buy_caps
  ADD COLUMN IF NOT EXISTS variation_id UUID
    REFERENCES public.product_variations(id) ON DELETE CASCADE;

-- The old table-level UNIQUE (batch_id, product_id) can't coexist with per-variation
-- rows for the same product. Replace it with two partial unique indexes so there is
-- at most one product-level cap AND at most one cap per variation, per batch.
ALTER TABLE public.group_buy_caps
  DROP CONSTRAINT IF EXISTS group_buy_caps_batch_id_product_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS group_buy_caps_batch_product_unique
  ON public.group_buy_caps (batch_id, product_id)
  WHERE variation_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS group_buy_caps_batch_variation_unique
  ON public.group_buy_caps (batch_id, variation_id)
  WHERE variation_id IS NOT NULL;

-- ===========================================================================
-- 2. Order-insert enforcement — variation-aware cap check.
--    Same lock + product-reference guard as before; the cap loop now honours the
--    override + shared-pool rule. Based on the latest definition from
--    20260705000000_link_repeat_orders_by_email.sql.
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

  -- One pass over every cap row for the batch. For each cap we sum only the units
  -- it governs:
  --   * variation cap (variation_id NOT NULL): units of that exact variation.
  --   * product cap (variation_id NULL): units of the product across ONLY the
  --     variations that have no cap of their own (line items whose variation_id is
  --     not itself a variation-capped one — including null-variation lines).
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
          AND (
            (c.variation_id IS NOT NULL AND (elem->>'variation_id') = c.variation_id::text)
            OR
            (c.variation_id IS NULL AND NOT EXISTS (
              SELECT 1 FROM public.group_buy_caps c2
              WHERE c2.batch_id = v_batch_id
                AND c2.product_id = c.product_id
                AND c2.variation_id IS NOT NULL
                AND c2.variation_id::text = (elem->>'variation_id')
            ))
          )
      ), 0) AS existing_total,
      COALESCE((
        SELECT SUM((elem->>'quantity')::numeric)
        FROM jsonb_array_elements(NEW.order_items) elem
        WHERE (elem->>'product_id') = c.product_id::text
          AND (
            (c.variation_id IS NOT NULL AND (elem->>'variation_id') = c.variation_id::text)
            OR
            (c.variation_id IS NULL AND NOT EXISTS (
              SELECT 1 FROM public.group_buy_caps c2
              WHERE c2.batch_id = v_batch_id
                AND c2.product_id = c.product_id
                AND c2.variation_id IS NOT NULL
                AND c2.variation_id::text = (elem->>'variation_id')
            ))
          )
      ), 0) AS new_total
    FROM public.group_buy_caps c
    WHERE c.batch_id = v_batch_id
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
-- 3. Progress RPC — per-product totals + caps, now with a per-variation breakdown.
--    Adds a `variations` array to each item so the storefront (anon) can enforce
--    variation caps without any PII. Product-level cap_quantity stays the
--    variation_id-NULL cap. Based on the latest definition from
--    20260703000000_group_buy_pasalo_mode.sql.
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
      'pasalo_mode',       v_batch.pasalo_mode
    ),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_group_buy_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_buy_progress(UUID) TO anon, authenticated;
