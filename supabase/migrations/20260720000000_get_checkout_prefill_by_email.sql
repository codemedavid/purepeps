-- Pure Peps — Prefill checkout for a returning customer, keyed by email.
--
-- Adds get_checkout_prefill_by_email, a customer-facing lookup that returns the
-- contact + shipping details of a returning customer's MOST-RECENT order so the
-- storefront can prefill (and, when complete, skip) the checkout form on ANY
-- device. localStorage prefill only covers the same device; this closes the gap
-- for a verified member who returns on a new device or after clearing storage.
--
-- Why a dedicated RPC: the existing get_orders_by_email (20260712000000) returns
-- tracking/totals but deliberately NOT the customer name/phone/address, and the
-- storefront runs as anon which cannot SELECT the orders table (PII lockdown).
-- So a new SECURITY DEFINER function is the only way to surface these fields.
--
-- SECURITY NOTE (same accepted tradeoff as get_orders_by_email): an email is
-- enumerable, so this RPC lets anyone who knows a customer's email read that
-- customer's saved name/phone/shipping address. To keep exposure minimal we
-- (a) expose ONLY this function — anon still cannot SELECT orders directly —
-- (b) return a SINGLE most-recent non-cancelled root order, and (c) the client
-- only ever calls it with the VERIFIED member email (access-gated), so in
-- practice a member only reads back their own details. Ownership is NOT verified
-- server-side; add a captcha / magic-link step later if that changes.
--
-- Idempotent; safe to re-run.

DROP FUNCTION IF EXISTS public.get_checkout_prefill_by_email(TEXT);
CREATE FUNCTION public.get_checkout_prefill_by_email(email_input TEXT)
RETURNS TABLE (
  customer_name TEXT, customer_phone TEXT, contact_method TEXT,
  shipping_address TEXT, shipping_barangay TEXT, shipping_city TEXT,
  shipping_state TEXT, shipping_zip_code TEXT,
  courier_id TEXT, shipping_location TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Normalize the same way checkout does (see enforce_group_buy_on_order).
  v_email := lower(btrim(coalesce(email_input, '')));
  IF v_email = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- Cast every column to TEXT so the RETURNS TABLE shape is stable regardless of
  -- the underlying column type (courier_id may be uuid; varchar vs text, etc.).
  SELECT o.customer_name::text, o.customer_phone::text, o.contact_method::text,
    o.shipping_address::text, o.shipping_barangay::text, o.shipping_city::text,
    o.shipping_state::text, o.shipping_zip_code::text,
    o.courier_id::text, o.shipping_location::text
  FROM public.orders o
  WHERE o.is_claim = false
    AND o.parent_order_id IS NULL
    AND o.order_status <> 'cancelled'
    AND lower(btrim(o.customer_email)) = v_email
  ORDER BY o.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkout_prefill_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_checkout_prefill_by_email(TEXT) TO anon, authenticated;
