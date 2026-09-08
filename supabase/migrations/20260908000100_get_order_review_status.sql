-- Pure Peps — tell a would-be reviewer why their order did not open the form.
--
-- get_reviewable_order (20260826000000) returns ZERO ROWS for three different
-- situations: the order does not exist, the email does not match it, and the
-- order exists under that email but is not delivered yet. Collapsing all three
-- into one message is right for the first two — naming which half was wrong
-- would turn the form into an oracle for "has this address ever ordered here" —
-- but it left the third case as a dead end. A customer whose order number and
-- email were both correct was told to go and check them. That is exactly what
-- happened on TBS-100740-4243.
--
-- This function answers ONLY the third case. It requires the order number AND
-- the email to match the SAME row, exactly as the reviewable lookup does, and
-- returns nothing otherwise, so the oracle stays shut. Note also that
-- get_orders_by_email already returns order_status from the email ALONE, so a
-- caller holding both values learns strictly less here than they can there.
--
-- Returns the ROOT order's status: reviews are granted per bundle, and the root
-- is the row the customer sees tracked.
--
-- Idempotent; safe to re-run.

DROP FUNCTION IF EXISTS public.get_order_review_status(TEXT, TEXT);
CREATE FUNCTION public.get_order_review_status(p_order_number TEXT, p_email TEXT)
RETURNS TABLE (order_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number TEXT;
  v_email        TEXT;
BEGIN
  v_order_number := lower(btrim(coalesce(p_order_number, '')));
  v_email        := lower(btrim(coalesce(p_email, '')));

  IF v_order_number = '' OR v_email = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT root.order_status
  FROM public.orders o
  JOIN public.orders root ON root.id = coalesce(o.parent_order_id, o.id)
  WHERE lower(btrim(o.order_number)) = v_order_number
    AND lower(btrim(o.customer_email)) = v_email
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_review_status(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_review_status(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_order_review_status(TEXT, TEXT) IS
  'Order status for a review lookup that found no delivered order. Requires order number AND email to match the same row; returns nothing otherwise.';
