-- Pure Peps — Tiered category access.
--
-- Until now, paid access was a single switch: an approved access_request for the
-- open batch unlocked checkout for the ENTIRE catalog. This migration scopes
-- access to a TIER, where a tier grants a chosen subset of categories at its own
-- price. A member picks ONE tier per batch and pays that tier's price; products
-- in categories outside their tier are browse-only (cannot be ordered).
--
--   * tiers              — global, reusable tier definitions (name, price,
--                          is_all_access). Reused across every batch.
--   * tier_categories    — which categories each (non-all-access) tier unlocks.
--   * access_requests.tier_id — the tier a paid request buys.
--   * get_access_tiers() — active tiers + their category ids + price, for the
--                          storefront Get Access picker (PII-free, anon-callable).
--   * get_access_grant() — batch-scoped grant for an email: status + the category
--                          ids the member's approved tier unlocks for the OPEN
--                          batch. Sibling of get_access_status (kept for wording).
--   * enforce_tier_on_order — BEFORE INSERT trigger that rejects any order whose
--                          items fall outside the buyer's approved tier. This is
--                          the authoritative gate; client checks are UX only.
--
-- Backfill keeps current members whole: an "All Access" tier is created (priced
-- at the open batch's access_fee) and every existing access_request is tagged to
-- it, so already-approved members keep full-catalog checkout.
--
-- Mirrors the per-batch access migration's conventions (SECURITY DEFINER RPCs,
-- insert-shaping/enforcement triggers, is_admin() writes). Idempotent where
-- practical; safe to re-run in the Supabase SQL editor.

-- ===========================================================================
-- 1. Schema
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.tiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  -- An all-access tier grants every category without enumerating rows, so new
  -- categories added later are automatically included.
  is_all_access BOOLEAN NOT NULL DEFAULT FALSE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- category_id is UUID (categories.id is uuid). Note products.category is TEXT
-- holding that uuid as a string, so order-time comparisons cast category_id::text.
CREATE TABLE IF NOT EXISTS public.tier_categories (
  tier_id     UUID NOT NULL REFERENCES public.tiers(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (tier_id, category_id)
);

CREATE INDEX IF NOT EXISTS tier_categories_category_idx
  ON public.tier_categories (category_id);

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES public.tiers(id);

CREATE INDEX IF NOT EXISTS access_requests_tier_id_idx
  ON public.access_requests (tier_id);

-- Keep updated_at fresh (reuses the shared trigger function).
DROP TRIGGER IF EXISTS update_tiers_updated_at ON public.tiers;
CREATE TRIGGER update_tiers_updated_at
  BEFORE UPDATE ON public.tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================================
-- 2. RLS — catalog-style: anon may SELECT (tiers are not PII), admins write.
--    Mirrors the lockdown_data_plane policy shape for categories.
-- ===========================================================================
ALTER TABLE public.tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_categories ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.tiers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiers TO authenticated;
GRANT SELECT ON public.tier_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tier_categories TO authenticated;

DROP POLICY IF EXISTS "tiers_public_select" ON public.tiers;
CREATE POLICY "tiers_public_select" ON public.tiers
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "tiers_admin_all" ON public.tiers;
CREATE POLICY "tiers_admin_all" ON public.tiers
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "tier_categories_public_select" ON public.tier_categories;
CREATE POLICY "tier_categories_public_select" ON public.tier_categories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "tier_categories_admin_all" ON public.tier_categories;
CREATE POLICY "tier_categories_admin_all" ON public.tier_categories
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===========================================================================
-- 3. Backfill — an "All Access" tier so current members keep full checkout.
--    Priced at the open batch's access_fee (fallback 250). Created once.
-- ===========================================================================
DO $$
DECLARE
  v_tier_id UUID;
  v_fee NUMERIC(10,2);
BEGIN
  SELECT id INTO v_tier_id
  FROM public.tiers
  WHERE is_all_access = TRUE
  ORDER BY created_at
  LIMIT 1;

  IF v_tier_id IS NULL THEN
    SELECT COALESCE(access_fee, 250) INTO v_fee
    FROM public.group_buy_batches
    WHERE status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;

    INSERT INTO public.tiers (name, description, price, is_all_access, active, sort_order)
    VALUES ('All Access', 'Full catalog access — every category.', COALESCE(v_fee, 250), TRUE, TRUE, 0)
    RETURNING id INTO v_tier_id;
  END IF;

  -- Tag every existing request (which previously unlocked everything) to the
  -- All Access tier so approved members keep full-catalog checkout.
  UPDATE public.access_requests
     SET tier_id = v_tier_id
   WHERE tier_id IS NULL;
END $$;

-- ===========================================================================
-- 4. Storefront: active tiers + their category ids + price.
--    PII-free, so anon may call it. is_all_access tiers return NULL category_ids
--    (the client treats NULL as "all categories").
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_access_tiers()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'description', t.description,
        'price', t.price,
        'is_all_access', t.is_all_access,
        'category_ids',
          CASE
            WHEN t.is_all_access THEN NULL
            ELSE COALESCE((
              SELECT jsonb_agg(tc.category_id ORDER BY tc.category_id)
              FROM public.tier_categories tc
              WHERE tc.tier_id = t.id
            ), '[]'::jsonb)
          END
      )
      ORDER BY t.sort_order, t.price
    ),
    '[]'::jsonb
  )
  FROM public.tiers t
  WHERE t.active = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_access_tiers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_access_tiers() TO anon, authenticated;

-- ===========================================================================
-- 5. Batch-scoped grant for an email.
--    Returns { status, tier_name, is_all_access, category_ids } for the OPEN
--    batch. status ∈ 'approved' | 'pending' | 'renew' | 'none' — same semantics
--    and resolution order as get_access_status. On 'approved', category_ids is
--    the approved tier's category list (NULL when the tier is all-access).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_access_grant(p_email text)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := lower(trim(coalesce(p_email, '')));
  v_batch_id UUID;
  v_status text;
  v_req RECORD;
  v_is_all BOOLEAN;
  v_tier_name TEXT;
  v_category_ids JSONB;
BEGIN
  v_status := public.get_access_status(normalized);

  IF v_status <> 'approved' THEN
    RETURN jsonb_build_object(
      'status', v_status,
      'tier_name', NULL,
      'is_all_access', FALSE,
      'category_ids', '[]'::jsonb
    );
  END IF;

  -- Approved on the open batch — find the approved request's tier.
  SELECT id INTO v_batch_id
  FROM public.group_buy_batches
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  SELECT ar.tier_id INTO v_req
  FROM public.access_requests ar
  WHERE lower(ar.email) = normalized
    AND ar.group_buy_batch_id = v_batch_id
    AND ar.status = 'approved'
  ORDER BY ar.updated_at DESC
  LIMIT 1;

  -- Legacy / untagged request: treat as all-access so nobody loses checkout.
  IF v_req.tier_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'approved',
      'tier_name', NULL,
      'is_all_access', TRUE,
      'category_ids', NULL
    );
  END IF;

  SELECT t.is_all_access, t.name INTO v_is_all, v_tier_name
  FROM public.tiers t
  WHERE t.id = v_req.tier_id;

  IF COALESCE(v_is_all, FALSE) THEN
    RETURN jsonb_build_object(
      'status', 'approved',
      'tier_name', v_tier_name,
      'is_all_access', TRUE,
      'category_ids', NULL
    );
  END IF;

  SELECT COALESCE(jsonb_agg(tc.category_id), '[]'::jsonb) INTO v_category_ids
  FROM public.tier_categories tc
  WHERE tc.tier_id = v_req.tier_id;

  RETURN jsonb_build_object(
    'status', 'approved',
    'tier_name', v_tier_name,
    'is_all_access', FALSE,
    'category_ids', v_category_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_access_grant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_access_grant(text) TO anon, authenticated;

-- ===========================================================================
-- 6. Authoritative order gate — reject items outside the buyer's tier.
--    Runs AFTER enforce_group_buy_on_order's checks would (separate trigger,
--    fires alphabetically after trg_enforce_group_buy_on_order is fine since
--    both are BEFORE INSERT and independent). Keys off the order's customer_email
--    matching an approved access_request for the open batch.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.enforce_tier_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(NEW.customer_email, '')));
  v_tier_id UUID;
  v_is_all BOOLEAN;
  v_offending text;
BEGIN
  -- Claims/add-on orders inherit access from their parent; skip the tier check.
  IF NEW.parent_order_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find the buyer's approved tier for the batch this order belongs to
  -- (enforce_group_buy_on_order has already stamped NEW.group_buy_batch_id).
  SELECT ar.tier_id INTO v_tier_id
  FROM public.access_requests ar
  WHERE lower(ar.email) = v_email
    AND ar.group_buy_batch_id = NEW.group_buy_batch_id
    AND ar.status = 'approved'
  ORDER BY ar.updated_at DESC
  LIMIT 1;

  -- No approved access at all for this batch — checkout is members-only and the
  -- access gate should have blocked this; reject defensively.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No approved group-buy access found for this email on the open batch.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Untagged (legacy) approval grants everything.
  IF v_tier_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_all_access INTO v_is_all FROM public.tiers WHERE id = v_tier_id;
  IF COALESCE(v_is_all, FALSE) THEN
    RETURN NEW;
  END IF;

  -- Any line item whose product's category is NOT in the tier is rejected.
  -- products.category is TEXT holding the category uuid, so cast tier_categories
  -- (uuid) to text for the comparison.
  SELECT p.category INTO v_offending
  FROM jsonb_array_elements(NEW.order_items) elem
  JOIN public.products p ON p.id::text = (elem->>'product_id')
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tier_categories tc
    WHERE tc.tier_id = v_tier_id
      AND tc.category_id::text = p.category
  )
  LIMIT 1;

  IF v_offending IS NOT NULL THEN
    RAISE EXCEPTION 'Your access tier does not include the category "%". Remove those items or upgrade your tier.', v_offending
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_tier_on_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_tier_on_order ON public.orders;
CREATE TRIGGER trg_enforce_tier_on_order
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tier_on_order();
