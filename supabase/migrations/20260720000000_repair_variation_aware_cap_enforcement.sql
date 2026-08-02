-- Pure Peps — Repair: re-install the VARIATION-AWARE group-buy cap trigger.
--
-- Incident (batch "Gb 5", 2026-08-02): checkout rejected valid orders with
--   "Group buy limit reached for one of the items in your order
--    (cap 20, already reserved 27, you requested 1)."
-- AICAR carries per-variation caps of 20 (100mg) and 20 (50mg) with 15 + 12 units
-- ordered — both variations still had room. 27 is the PRODUCT total. A variation
-- cap was being compared against the whole product's units, which is exactly what
-- the pre-20260716 definition of enforce_group_buy_on_order does: it loops over
-- every group_buy_caps row and sums all of the product's units against it,
-- ignoring group_buy_caps.variation_id.
--
-- Root cause: the DEPLOYED function was an older definition than the one in
-- 20260716000000_group_buy_variation_caps.sql. Six migration files define this
-- same function; re-applying any pre-20260716 file silently reverts cap
-- enforcement to product-level. The storefront math (src/utils/groupBuy.ts,
-- remainingForVariation) stayed variation-aware, so the UI showed room while the
-- trigger refused the insert.
--
-- This migration is idempotent and safe to re-run. It:
--   1. re-asserts the variation_id column + partial unique indexes (no-ops if present);
--   2. re-installs the variation-aware function, now stamped with a version marker
--      so the deployed body can be fingerprinted (see section 3);
--   3. re-attaches the trigger and verifies the installed definition, raising if
--      a stale body is somehow still in place.
--
-- Apply in the Supabase SQL editor (whole file, one run).

-- ===========================================================================
-- 1. Schema — variation-level cap rows. No-ops when already applied.
-- ===========================================================================
ALTER TABLE public.group_buy_caps
  ADD COLUMN IF NOT EXISTS variation_id UUID
    REFERENCES public.product_variations(id) ON DELETE CASCADE;

ALTER TABLE public.group_buy_caps
  DROP CONSTRAINT IF EXISTS group_buy_caps_batch_id_product_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS group_buy_caps_batch_product_unique
  ON public.group_buy_caps (batch_id, product_id)
  WHERE variation_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS group_buy_caps_batch_variation_unique
  ON public.group_buy_caps (batch_id, variation_id)
  WHERE variation_id IS NOT NULL;

-- ===========================================================================
-- 2. Enforcement — identical cap resolution to 20260716, plus the version marker.
--
--    Cap resolution rule (mirrors remainingForVariation in src/utils/groupBuy.ts):
--      * variation cap (variation_id NOT NULL) governs ONLY that variation and
--        OVERRIDES the product cap for it;
--      * product cap (variation_id NULL) governs ONLY the variations that have no
--        cap of their own — they share it as one pool;
--      * neither set → unlimited.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.enforce_group_buy_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- enforcement-version: variation-aware-v2
-- Do NOT replace this body with a definition that omits group_buy_caps.variation_id;
-- doing so reverts cap enforcement to product-level and rejects orders for
-- variations that still have room. See src/utils/capEnforcementMigrations.test.ts.
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

  -- One pass over every cap row for the batch. For each cap we sum ONLY the units
  -- it governs:
  --   * variation cap (variation_id NOT NULL): units of that exact variation.
  --   * product cap (variation_id NULL): units of the product across ONLY the
  --     variations that have no cap of their own (including null-variation lines).
  FOR rec IN
    SELECT
      c.cap_quantity,
      c.variation_id,
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

-- A trigger function, never an API endpoint: keep it off the PostgREST RPC surface.
REVOKE ALL ON FUNCTION public.enforce_group_buy_on_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_group_buy_on_order ON public.orders;
CREATE TRIGGER trg_enforce_group_buy_on_order
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_group_buy_on_order();

-- ===========================================================================
-- 3. Verify — fail loudly if the installed body is not the variation-aware one.
--    Run this SELECT on its own any time to check the DEPLOYED function:
--
--      SELECT pg_get_functiondef('public.enforce_group_buy_on_order()'::regprocedure)
--             LIKE '%enforcement-version: variation-aware-v2%' AS is_variation_aware;
--
--    FALSE means an older migration file was re-applied over this one.
-- ===========================================================================
DO $verify$
BEGIN
  IF pg_get_functiondef('public.enforce_group_buy_on_order()'::regprocedure)
     NOT LIKE '%enforcement-version: variation-aware-v2%' THEN
    RAISE EXCEPTION
      'enforce_group_buy_on_order is still a stale, product-level definition. Re-apply this migration.';
  END IF;
END
$verify$;
