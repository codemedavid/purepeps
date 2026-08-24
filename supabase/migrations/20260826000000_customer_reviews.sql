-- ===========================================================================
-- Pure Peps — verified-purchase customer reviews.
--
-- Adds public.product_reviews plus the three RPCs that are the ONLY way the
-- public storefront touches it. Reviews are written by anonymous visitors, but
-- every one of them is tied to a delivered order, and every one starts life
-- awaiting admin approval.
--
-- THE PRIVACY BOUNDARY
-- A review row carries two kinds of data that must never mix:
--   * PUBLIC   — display_name (a pseudonym the reviewer chooses), rating, body,
--                media, product, date, and the admin's reply.
--   * PRIVATE  — reviewer_name / reviewer_email / reviewer_phone / order_number,
--                stored ONLY so an admin can verify the purchase before
--                approving.
-- The boundary is enforced three ways, deepest first:
--   1. anon holds NO grant on product_reviews. It cannot SELECT the table at
--      all, so there is no policy to get wrong and no column to leak.
--   2. get_approved_reviews' RETURNS TABLE has no private column in it. The
--      function signature itself is the filter — adding a PII column to the
--      table later cannot widen what this returns.
--   3. RLS restricts all direct access to admins via public.is_admin().
--
-- WHY SUBMISSION IS AN RPC AND NOT AN anon INSERT
-- If anon could INSERT, the client would be supplying reviewer_name / email /
-- phone / status, and a forged request could post a pre-approved review under
-- someone else's name. Instead submit_product_review re-verifies the order
-- number AND email server-side, snapshots the identity fields FROM THE ORDER
-- ROW, and hard-codes status = 'pending'. There is deliberately no p_order_id
-- parameter: accepting a caller-supplied order id would let a caller skip the
-- verification entirely.
--
-- Idempotent; safe to re-run. Never drops the table and never touches orders.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Verification linkage. Admin-visible only; never returned to the public.
  -- CASCADE so deleting an order also removes the reviews justified by it.
  order_id         UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- Snapshot: an order number can be edited later, but the review should keep
  -- showing the admin the reference the customer actually typed.
  order_number     TEXT,

  product_id       TEXT NOT NULL,
  -- Snapshot too: products get renamed and deleted, and a review must stay
  -- readable ("BPC-157") even when the catalog row is gone.
  product_name     TEXT NOT NULL,
  variation_name   TEXT,

  -- PRIVATE reviewer identity, copied from the order by the submit RPC.
  reviewer_name    TEXT NOT NULL,
  reviewer_email   TEXT NOT NULL,
  reviewer_phone   TEXT,

  -- PUBLIC content. display_name is whatever pseudonym the reviewer chose.
  display_name     TEXT NOT NULL,
  rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body             TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 10 AND 2000),
  media_urls       TEXT[] NOT NULL DEFAULT '{}',

  -- Moderation. DEFAULT 'pending' is the belt; the submit RPC writing the
  -- literal 'pending' is the braces. Neither path can produce a born-approved
  -- review.
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','hidden')),
  admin_reply      TEXT,
  admin_replied_at TIMESTAMPTZ,
  moderated_at     TIMESTAMPTZ,
  moderated_by     UUID,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One review per purchased product, so a single delivered order cannot be
  -- farmed for repeat reviews of the same item.
  UNIQUE (order_id, product_id)
);

-- The public page filters by product and approval; the admin queue reads the
-- newest of a given status first.
CREATE INDEX IF NOT EXISTS product_reviews_product_status_idx
  ON public.product_reviews (product_id, status);
CREATE INDEX IF NOT EXISTS product_reviews_status_created_idx
  ON public.product_reviews (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. RLS — admins only. anon reaches reviews exclusively through the RPCs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.product_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reviews TO authenticated;

-- Clean slate first, so no legacy permissive policy can OR-in a public read.
SELECT public._drop_all_policies('public.product_reviews'::regclass);

CREATE POLICY product_reviews_admin_all ON public.product_reviews
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. get_reviewable_order — "prove the purchase, get the product list".
--
-- Returns the reviewable line items of a DELIVERED order when the order number
-- and the email both match the same order. Returns ZERO ROWS on any mismatch:
-- a wrong email and a non-existent order are indistinguishable to the caller,
-- so this cannot be used to test whether an address ever ordered.
--
-- Walks the bundle (root + claim / add-on children) the same way
-- get_order_bundle does, so items added after the original order are reviewable.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_reviewable_order(TEXT, TEXT);
CREATE FUNCTION public.get_reviewable_order(p_order_number TEXT, p_email TEXT)
RETURNS TABLE (
  product_id       TEXT,
  product_name     TEXT,
  variation_name   TEXT,
  already_reviewed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number TEXT;
  v_email        TEXT;
  v_root_id      UUID;
BEGIN
  v_order_number := lower(btrim(coalesce(p_order_number, '')));
  v_email        := lower(btrim(coalesce(p_email, '')));

  IF v_order_number = '' OR v_email = '' THEN
    RETURN;
  END IF;

  -- BOTH must match the SAME row, and it must have been delivered.
  SELECT coalesce(o.parent_order_id, o.id)
    INTO v_root_id
  FROM public.orders o
  WHERE lower(btrim(o.order_number)) = v_order_number
    AND lower(btrim(o.customer_email)) = v_email
    AND o.order_status = 'delivered'
  LIMIT 1;

  IF v_root_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    item->>'product_id',
    item->>'product_name',
    item->>'variation_name',
    EXISTS (
      SELECT 1 FROM public.product_reviews r
      WHERE r.order_id = o.id
        AND r.product_id = item->>'product_id'
    )
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.order_items) AS item
  WHERE (o.id = v_root_id OR o.parent_order_id = v_root_id)
    AND o.order_status = 'delivered'
    AND item->>'product_id' IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reviewable_order(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reviewable_order(TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. submit_product_review — the only write path open to the public.
--
-- Re-runs the full verification from the raw order number + email. It does NOT
-- accept an order id: trusting a caller-supplied identifier is exactly how a
-- verification gate gets bypassed.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_product_review(TEXT, TEXT, TEXT, SMALLINT, TEXT, TEXT, TEXT[]);
CREATE FUNCTION public.submit_product_review(
  p_order_number  TEXT,
  p_email         TEXT,
  p_product_id    TEXT,
  p_rating        SMALLINT,
  p_body          TEXT,
  p_display_name  TEXT,
  p_media_urls    TEXT[] DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number  TEXT;
  v_email         TEXT;
  v_root_id       UUID;
  v_order         public.orders%ROWTYPE;
  v_item          JSONB;
  v_display_name  TEXT;
  v_media         TEXT[];
  v_media_enabled BOOLEAN;
BEGIN
  v_order_number := lower(btrim(coalesce(p_order_number, '')));
  v_email        := lower(btrim(coalesce(p_email, '')));

  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Please choose a star rating from 1 to 5.';
  END IF;

  IF char_length(btrim(coalesce(p_body, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'Please write a review between 10 and 2000 characters.';
  END IF;

  -- Same both-must-match gate as get_reviewable_order.
  SELECT coalesce(o.parent_order_id, o.id)
    INTO v_root_id
  FROM public.orders o
  WHERE lower(btrim(o.order_number)) = v_order_number
    AND lower(btrim(o.customer_email)) = v_email
    AND o.order_status = 'delivered'
  LIMIT 1;

  IF v_root_id IS NULL THEN
    -- Deliberately generic: never reveal whether the order or the email was wrong.
    RAISE EXCEPTION 'We could not match that order number and email to a delivered order.';
  END IF;

  -- Find the bundle order that actually contains this product. Reviews attach
  -- to that specific order so the admin sees the right reference.
  SELECT o.*, item
    INTO v_order, v_item
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.order_items) AS item
  WHERE (o.id = v_root_id OR o.parent_order_id = v_root_id)
    AND o.order_status = 'delivered'
    AND item->>'product_id' = p_product_id
  LIMIT 1;

  IF v_item IS NULL THEN
    RAISE EXCEPTION 'That product is not part of the order you verified.';
  END IF;

  -- Media is dropped entirely when the admin has the switch off, regardless of
  -- what the caller sent. Fail-open on a missing row, matching featureFlags.ts:
  -- only the literal 'false' disables.
  SELECT coalesce(value, 'true') <> 'false' INTO v_media_enabled
  FROM public.site_settings WHERE id = 'feature_review_media_enabled';
  v_media_enabled := coalesce(v_media_enabled, true);
  v_media := CASE WHEN v_media_enabled THEN coalesce(p_media_urls, '{}') ELSE '{}' END;

  -- Cap attachments so an anonymous upload path cannot be used to bulk-store files.
  IF array_length(v_media, 1) > 4 THEN
    RAISE EXCEPTION 'Please attach at most 4 photos.';
  END IF;

  -- A blank display name becomes an anonymous label — never the real name on
  -- the order. Mirrors normalizeDisplayName() in src/utils/reviews.ts.
  v_display_name := btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g'));
  IF v_display_name = '' THEN
    v_display_name := 'Verified Customer';
  END IF;
  v_display_name := left(v_display_name, 40);

  INSERT INTO public.product_reviews (
    order_id, order_number, product_id, product_name, variation_name,
    reviewer_name, reviewer_email, reviewer_phone,
    display_name, rating, body, media_urls, status
  ) VALUES (
    v_order.id,
    v_order.order_number,
    p_product_id,
    coalesce(v_item->>'product_name', p_product_id),
    v_item->>'variation_name',
    -- Identity is SNAPSHOTTED FROM THE ORDER, never from a parameter. There is
    -- no way for a caller to write a name or email of their choosing here.
    v_order.customer_name,
    v_order.customer_email,
    v_order.customer_phone,
    v_display_name,
    p_rating,
    btrim(p_body),
    v_media,
    -- Hard-coded, not defaulted and not parameterised.
    'pending'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'You have already reviewed this product for this order.';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_product_review(TEXT, TEXT, TEXT, SMALLINT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_product_review(TEXT, TEXT, TEXT, SMALLINT, TEXT, TEXT, TEXT[]) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. get_approved_reviews — the public read.
--
-- The RETURNS TABLE below is the privacy boundary. It lists only what a shopper
-- may see; no reviewer_name / reviewer_email / reviewer_phone / order_number /
-- order_id / moderated_by column exists in it, so those cannot be returned even
-- if a future migration adds more PII to the table.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_approved_reviews(TEXT);
CREATE FUNCTION public.get_approved_reviews(p_product_id TEXT DEFAULT NULL)
RETURNS TABLE (
  id               UUID,
  product_id       TEXT,
  product_name     TEXT,
  variation_name   TEXT,
  display_name     TEXT,
  rating           SMALLINT,
  body             TEXT,
  media_urls       TEXT[],
  admin_reply      TEXT,
  admin_replied_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.id, r.product_id, r.product_name, r.variation_name,
         r.display_name, r.rating, r.body, r.media_urls,
         r.admin_reply, r.admin_replied_at, r.created_at
  FROM public.product_reviews r
  WHERE r.status = 'approved'
    AND (p_product_id IS NULL OR r.product_id = p_product_id)
  ORDER BY r.created_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.get_approved_reviews(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_reviews(TEXT) TO anon, authenticated;
