-- Pure Peps — server-backed member cart.
--
-- The storefront cart lives in localStorage, which the browser can evict (Safari
-- ITP, "clear on close", private mode) and which never follows a member to
-- another device. This adds a server cart so a VERIFIED member's selections
-- survive eviction and move across devices.
--
-- Security model (matches the email-based access gate): only an email that is
-- 'approved' for the OPEN batch (public.get_access_status) may read or write its
-- cart. The row stores catalog references + quantities ONLY — no PII, no price
-- snapshot. RLS denies all direct anon/authenticated table access; the two
-- SECURITY DEFINER RPCs below are the only entry points, and each re-checks
-- approval. Idempotent; safe to re-run.

CREATE TABLE IF NOT EXISTS public.member_carts (
  email      text PRIMARY KEY,
  items      jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.member_carts ENABLE ROW LEVEL SECURITY;

-- No policies => no direct table access for anon/authenticated. All access flows
-- through the definer RPCs, which enforce the approval check.
REVOKE ALL ON public.member_carts FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_member_cart(email) — the approved member's stored cart, else empty.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_member_cart(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := lower(trim(coalesce(p_email, '')));
  v_items jsonb;
BEGIN
  -- Not verified for the open batch => nothing to hand back.
  IF normalized = '' OR public.get_access_status(normalized) <> 'approved' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT items INTO v_items FROM public.member_carts WHERE email = normalized;
  RETURN coalesce(v_items, '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- save_member_cart(email, items) — upsert an approved member's cart.
-- Re-validates approval and sanitizes every row server-side; the client payload
-- is never trusted wholesale. Malformed rows are dropped, not persisted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_member_cart(p_email text, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := lower(trim(coalesce(p_email, '')));
  elem jsonb;
  clean jsonb := '[]'::jsonb;
BEGIN
  IF normalized = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;

  -- Only an approved member may persist a cart (guards against writing to an
  -- arbitrary email via the public anon key).
  IF public.get_access_status(normalized) <> 'approved' THEN
    RAISE EXCEPTION 'not approved for the open batch';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a json array';
  END IF;

  -- Keep only well-formed { product_id, variation_id, quantity } rows.
  FOR elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(elem->'product_id') = 'string'
       AND length(elem->>'product_id') > 0
       AND jsonb_typeof(elem->'variation_id') IN ('string', 'null')
       AND jsonb_typeof(elem->'quantity') = 'number'
       AND (elem->>'quantity')::numeric > 0
       AND (elem->>'quantity')::numeric = floor((elem->>'quantity')::numeric)
    THEN
      clean := clean || jsonb_build_array(jsonb_build_object(
        'product_id', elem->>'product_id',
        'variation_id',
          CASE WHEN jsonb_typeof(elem->'variation_id') = 'null'
               THEN NULL ELSE elem->>'variation_id' END,
        'quantity', (elem->>'quantity')::int
      ));
    END IF;
  END LOOP;

  INSERT INTO public.member_carts (email, items, updated_at)
  VALUES (normalized, clean, now())
  ON CONFLICT (email) DO UPDATE
    SET items = EXCLUDED.items, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_cart(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_member_cart(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_cart(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_member_cart(text, jsonb) TO anon, authenticated;
