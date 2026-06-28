-- Pure Peps — Self-serve tier upgrades.
--
-- A member who already paid for a lower tier on the OPEN batch can upgrade to a
-- higher-priced tier by paying only the DIFFERENCE. An upgrade is modelled as a
-- brand-new pending access_request (same email + batch, the target tier_id,
-- amount = price difference) — NOT a mutation of the approved row. This reuses
-- the existing approve/reject admin flow and keeps a full audit trail, and the
-- member keeps their current tier until the upgrade is approved (no access gap).
--
--   * get_upgrade_options(p_email) — offered tiers on the open batch priced ABOVE
--                                    the member's current approved tier, each with
--                                    the delta to pay. PII-free, anon-callable.
--   * get_access_grant()           — hardened tie-break: when several approved
--                                    requests exist for the batch (e.g. base +
--                                    approved upgrade), resolve to the member's
--                                    HIGHEST tier so an approved upgrade wins
--                                    regardless of row update order.
--
-- No change to enforce_tier_on_order: once the upgrade request is approved,
-- get_access_grant and the order gate read the higher tier automatically.
--
-- Idempotent; safe to re-run in the Supabase SQL editor.

-- ===========================================================================
-- 1. get_access_grant — prefer the member's highest approved tier for the batch.
--    Legacy (untagged) approvals and explicit all-access tiers still win so no
--    one loses checkout. Otherwise the highest-priced approved tier resolves.
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
  v_tier_id UUID;
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

  -- Approved on the open batch — resolve the member's HIGHEST approved tier.
  SELECT id INTO v_batch_id
  FROM public.group_buy_batches
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  SELECT ar.tier_id INTO v_tier_id
  FROM public.access_requests ar
  LEFT JOIN public.tiers t ON t.id = ar.tier_id
  WHERE lower(ar.email) = normalized
    AND ar.group_buy_batch_id = v_batch_id
    AND ar.status = 'approved'
  ORDER BY
    (ar.tier_id IS NULL) DESC,                 -- legacy all-access wins
    COALESCE(t.is_all_access, FALSE) DESC,     -- explicit all-access next
    COALESCE(t.price, 0) DESC,                 -- otherwise the highest-priced tier
    ar.updated_at DESC
  LIMIT 1;

  -- Legacy / untagged request: treat as all-access so nobody loses checkout.
  IF v_tier_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'approved',
      'tier_name', NULL,
      'is_all_access', TRUE,
      'category_ids', NULL
    );
  END IF;

  SELECT t.is_all_access, t.name INTO v_is_all, v_tier_name
  FROM public.tiers t
  WHERE t.id = v_tier_id;

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
  WHERE tc.tier_id = v_tier_id;

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
-- 2. get_upgrade_options — higher-priced tiers the member can upgrade INTO on
--    the open batch, with the price difference to pay. Returns [] when:
--      * the email is not approved on the open batch (must hold a tier first),
--      * the member already holds an all-access / top-priced tier, or
--      * an upgrade request is already pending for this batch (avoid duplicates).
--    PII-free (keys off the caller-supplied email only), anon-callable. Each
--    element mirrors get_access_tiers and adds current_price + delta.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_upgrade_options(p_email text)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := lower(trim(coalesce(p_email, '')));
  v_batch_id UUID;
  v_current_tier_id UUID;
  v_current_is_all BOOLEAN;
  v_current_price NUMERIC;
  v_has_pending BOOLEAN;
  v_options JSONB;
BEGIN
  IF normalized = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  -- The currently-open batch (upgrades are scoped to it, like access itself).
  SELECT id INTO v_batch_id
  FROM public.group_buy_batches
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_batch_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- The member's current approved tier on the open batch (highest, matching the
  -- grant resolution). No approved tier → no base access → nothing to upgrade.
  SELECT ar.tier_id INTO v_current_tier_id
  FROM public.access_requests ar
  LEFT JOIN public.tiers t ON t.id = ar.tier_id
  WHERE lower(ar.email) = normalized
    AND ar.group_buy_batch_id = v_batch_id
    AND ar.status = 'approved'
  ORDER BY
    (ar.tier_id IS NULL) DESC,
    COALESCE(t.is_all_access, FALSE) DESC,
    COALESCE(t.price, 0) DESC,
    ar.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  -- A legacy untagged approval already grants everything — no upgrade exists.
  IF v_current_tier_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT t.is_all_access, COALESCE(t.price, 0)
    INTO v_current_is_all, v_current_price
  FROM public.tiers t
  WHERE t.id = v_current_tier_id;

  -- Already top of the ladder.
  IF COALESCE(v_current_is_all, FALSE) THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Avoid stacking duplicate upgrade requests while one awaits review.
  SELECT EXISTS (
    SELECT 1 FROM public.access_requests ar
    WHERE lower(ar.email) = normalized
      AND ar.group_buy_batch_id = v_batch_id
      AND ar.status = 'pending'
  ) INTO v_has_pending;

  IF v_has_pending THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Offered tiers on this batch priced strictly above the current tier.
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
          END,
        'current_price', v_current_price,
        'delta', GREATEST(COALESCE(t.price, 0) - v_current_price, 0)
      )
      ORDER BY t.sort_order, t.price
    ),
    '[]'::jsonb
  ) INTO v_options
  FROM public.tiers t
  JOIN public.batch_tiers bt ON bt.tier_id = t.id
  WHERE bt.group_buy_batch_id = v_batch_id
    AND t.active = TRUE
    AND t.id <> v_current_tier_id
    AND COALESCE(t.price, 0) > v_current_price;

  RETURN v_options;
END;
$$;

REVOKE ALL ON FUNCTION public.get_upgrade_options(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_upgrade_options(text) TO anon, authenticated;
