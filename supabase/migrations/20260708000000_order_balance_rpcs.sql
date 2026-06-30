-- Pure Peps — Customer-facing RPCs for the post-checkout balance flow.
--
-- 1. get_order_bundle now also returns paid_total and a derived balance_due, so
--    the tracking page can show "additional payment required" when an admin added
--    items after the order was paid.
-- 2. submit_additional_payment lets the customer (anon, authenticated by their
--    unique order number — the same trust model as get_order_bundle) attach a new
--    receipt for the balance. It only works when a balance is actually owed, and
--    only moves the order to 'submitted' (under review) — an admin still verifies.
--
-- Idempotent; safe to re-run.

-- ===========================================================================
-- 1. Bundle RPC — add paid_total + derived balance_due. Everything else is
--    unchanged from 20260705000000 (exact order-number match, root + add-ons).
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_order_bundle(TEXT);
CREATE FUNCTION public.get_order_bundle(order_id_input TEXT)
RETURNS TABLE (
  id UUID, order_number TEXT, order_status TEXT, payment_status TEXT, payment_method_name TEXT,
  tracking_number TEXT, shipping_provider TEXT, shipping_note TEXT,
  total_price DECIMAL(10,2), shipping_fee DECIMAL(10,2),
  order_items JSONB, created_at TIMESTAMPTZ, promo_code TEXT, discount_applied DECIMAL(10,2),
  fulfillment_stage TEXT, is_claim BOOLEAN, parent_order_id UUID, group_buy_batch_id UUID, batch_status TEXT,
  paid_total DECIMAL(10,2), balance_due DECIMAL(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root UUID;
BEGIN
  -- Exact order-number match only (order numbers are unique + non-enumerable).
  SELECT COALESCE(o.parent_order_id, o.id) INTO v_root
  FROM public.orders o
  WHERE o.order_number ILIKE btrim(order_id_input)
  ORDER BY o.parent_order_id NULLS FIRST
  LIMIT 1;

  IF v_root IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.id, o.order_number, o.order_status, o.payment_status, o.payment_method_name,
    o.tracking_number, o.shipping_provider, o.shipping_note, o.total_price, o.shipping_fee,
    o.order_items, o.created_at, o.promo_code, o.discount_applied,
    gb.fulfillment_stage, o.is_claim, o.parent_order_id, o.group_buy_batch_id, gb.status,
    o.paid_total,
    CASE WHEN o.paid_total IS NOT NULL THEN GREATEST(0, o.total_price - o.paid_total) ELSE 0 END
  FROM public.orders o
  LEFT JOIN public.group_buy_batches gb ON gb.id = o.group_buy_batch_id
  WHERE o.id = v_root OR o.parent_order_id = v_root
  ORDER BY o.is_claim, o.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_bundle(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_bundle(TEXT) TO anon, authenticated;

-- ===========================================================================
-- 2. submit_additional_payment — customer attaches a receipt for the balance.
--    Guards: receipt required; order must exist; a balance must actually be due.
--    Only flips payment_status to 'submitted' (awaiting admin verification) —
--    NEVER to 'paid', so a customer can't self-confirm.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.submit_additional_payment(TEXT, TEXT);
CREATE FUNCTION public.submit_additional_payment(order_id_input TEXT, proof_url TEXT)
RETURNS TABLE (order_number TEXT, payment_status TEXT, balance_due DECIMAL(10,2))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_balance DECIMAL(10,2);
BEGIN
  IF proof_url IS NULL OR btrim(proof_url) = '' THEN
    RAISE EXCEPTION 'A payment receipt is required.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT o.id,
    CASE WHEN o.paid_total IS NOT NULL THEN GREATEST(0, o.total_price - o.paid_total) ELSE 0 END
  INTO v_id, v_balance
  FROM public.orders o
  WHERE o.order_number ILIKE btrim(order_id_input)
  ORDER BY o.parent_order_id NULLS FIRST
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_balance <= 0 THEN
    RAISE EXCEPTION 'This order has no additional payment due.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.orders o
  SET additional_payment_proof_url = btrim(proof_url),
      payment_status = 'submitted',
      updated_at = now()
  WHERE o.id = v_id;

  RETURN QUERY
  SELECT o.order_number, o.payment_status,
    CASE WHEN o.paid_total IS NOT NULL THEN GREATEST(0, o.total_price - o.paid_total) ELSE 0 END
  FROM public.orders o
  WHERE o.id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_additional_payment(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_additional_payment(TEXT, TEXT) TO anon, authenticated;
