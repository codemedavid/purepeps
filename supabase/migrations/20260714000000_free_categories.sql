-- ===========================================================================
-- Free-for-everyone categories.
--
-- A category flagged is_free is purchasable by ANYONE — including visitors who
-- never paid for group-buy access. This is the source of truth for "free access":
-- the storefront treats free categories as always-unlocked, and the order gate
-- below allows free-category items without an approved access request.
--
-- Backward compatible: with no free categories every item is "gated" and the
-- tier enforcement behaves exactly as before.
-- ===========================================================================

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.categories.is_free IS
  'When true, products in this category are free for everyone to order — no paid group-buy access required. Enforced in enforce_tier_on_order().';

-- ---------------------------------------------------------------------------
-- Authoritative order gate — reworked to let free-category items through for
-- everyone, and to gate ONLY the non-free items against the buyer's tier.
-- ---------------------------------------------------------------------------
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
  v_gated_count integer;
BEGIN
  -- Claims/add-on orders inherit access from their parent; skip the tier check.
  IF NEW.parent_order_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Count line items whose product's category is NOT free. products.category is
  -- TEXT holding the category uuid, so cast categories.id to text to join.
  SELECT count(*) INTO v_gated_count
  FROM jsonb_array_elements(NEW.order_items) elem
  JOIN public.products p ON p.id::text = (elem->>'product_id')
  LEFT JOIN public.categories c ON c.id::text = p.category
  WHERE COALESCE(c.is_free, FALSE) = FALSE;

  -- Free-only order (every item is in a free category): anyone may buy it, no
  -- approved access request required. This is the "free for everyone" path.
  IF v_gated_count = 0 THEN
    RETURN NEW;
  END IF;

  -- There are gated items — require the buyer's approved tier for this batch
  -- (enforce_group_buy_on_order has already stamped NEW.group_buy_batch_id).
  SELECT ar.tier_id INTO v_tier_id
  FROM public.access_requests ar
  WHERE lower(ar.email) = v_email
    AND ar.group_buy_batch_id = NEW.group_buy_batch_id
    AND ar.status = 'approved'
  ORDER BY ar.updated_at DESC
  LIMIT 1;

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

  -- Any NON-FREE line item whose category is outside the tier is rejected.
  -- Free-category items are excluded from the tier check entirely.
  SELECT p.category INTO v_offending
  FROM jsonb_array_elements(NEW.order_items) elem
  JOIN public.products p ON p.id::text = (elem->>'product_id')
  LEFT JOIN public.categories c ON c.id::text = p.category
  WHERE COALESCE(c.is_free, FALSE) = FALSE
    AND NOT EXISTS (
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
