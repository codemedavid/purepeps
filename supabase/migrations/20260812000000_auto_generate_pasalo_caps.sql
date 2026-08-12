-- Pure Peps — automatically prepare the remaining order slots for Pasalo mode.
--
-- Enabling Pasalo replaces every cap in the open batch with a cap for each
-- product/variation that already has non-cancelled demand. Caps always advance
-- to the next block of ten (26 -> 30, 30 -> 40). Disabling Pasalo leaves caps
-- untouched. The advisory lock is shared with enforce_group_buy_on_order(), so
-- cap generation and checkout cannot observe partially updated totals.

CREATE OR REPLACE FUNCTION public.set_group_buy_pasalo_mode(
  p_id      UUID,
  p_enabled BOOLEAN
)
RETURNS public.group_buy_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- pasalo-cap-version: next-ten-v1
DECLARE
  v_batch   public.group_buy_batches%ROWTYPE;
  v_enabled BOOLEAN := COALESCE(p_enabled, false);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to set pasalo mode.';
  END IF;

  SELECT * INTO v_batch
  FROM public.group_buy_batches
  WHERE id = p_id
  FOR UPDATE;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Batch % not found.', p_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Turning Pasalo off is deliberately non-destructive: keep the generated caps
  -- available for review until the next enable recalculates them.
  IF NOT v_enabled THEN
    UPDATE public.group_buy_batches
       SET pasalo_mode = false
     WHERE id = p_id
    RETURNING * INTO v_batch;

    RETURN v_batch;
  END IF;

  IF v_batch.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Pasalo mode can only be enabled for an open group buy batch.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('group_buy_cap:' || p_id::text));

  -- Rebuild rather than merge: manual caps and caps for items with no live demand
  -- must not leak into the Pasalo storefront.
  DELETE FROM public.group_buy_caps
  WHERE batch_id = p_id;

  WITH demand AS (
    SELECT
      p.id AS product_id,
      pv.id AS variation_id,
      SUM((elem->>'quantity')::numeric) AS total_quantity
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.order_items) AS elem
    JOIN public.products p
      ON p.id::text = (elem->>'product_id')
    LEFT JOIN public.product_variations pv
      ON pv.id::text = NULLIF(elem->>'variation_id', '')
     AND pv.product_id = p.id
    WHERE o.group_buy_batch_id = p_id
      AND o.order_status <> 'cancelled'
    GROUP BY p.id, pv.id
    HAVING SUM((elem->>'quantity')::numeric) > 0
  )
  INSERT INTO public.group_buy_caps (
    batch_id,
    product_id,
    variation_id,
    cap_quantity
  )
  SELECT
    p_id,
    d.product_id,
    d.variation_id,
    ((FLOOR(d.total_quantity / 10) + 1) * 10)::integer
  FROM demand d;

  UPDATE public.group_buy_batches
     SET pasalo_mode = true
   WHERE id = p_id
  RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.set_group_buy_pasalo_mode(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_group_buy_pasalo_mode(UUID, BOOLEAN) TO authenticated;
