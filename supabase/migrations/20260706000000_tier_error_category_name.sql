-- Show the human category NAME in the tier-gate rejection, not the raw UUID.
--
-- enforce_tier_on_order previously raised:
--   'Your access tier does not include the category "c0a80121-0001-...".'
-- which is meaningless to a shopper. products.category holds the category's uuid
-- as TEXT, so we now resolve it to categories.name for the message (falling back
-- to the raw value if the row is missing). Behaviour is otherwise unchanged.

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
  v_offending_name text;
BEGIN
  -- Claims/add-on orders inherit access from their parent; skip the tier check.
  IF NEW.parent_order_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find the buyer's approved tier for the batch this order belongs to.
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

  -- Any line item whose product's category is NOT in the tier is rejected.
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
    -- Resolve the uuid to a readable name for the shopper-facing message.
    SELECT c.name INTO v_offending_name
    FROM public.categories c
    WHERE c.id::text = v_offending;

    RAISE EXCEPTION 'Your access tier does not include "%". Remove those items or upgrade your tier.',
      COALESCE(v_offending_name, v_offending)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_tier_on_order() FROM PUBLIC, anon, authenticated;
