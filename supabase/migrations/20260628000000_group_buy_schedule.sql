-- Pure Peps — Group-buy announced schedule (starts_at / ends_at).
--
-- Adds admin-controlled DISPLAY dates to a batch, distinct from the operational
-- lifecycle timestamps (opened_at is server-set on creation; closed_at/finalized_at
-- track state transitions). starts_at/ends_at are what the storefront hero shows
-- as the announced window + live countdown, so the admin can schedule and
-- communicate the buy regardless of when the batch row was technically opened.
--
--   * group_buy_batches.starts_at / ends_at — nullable TIMESTAMPTZ, admin-set.
--   * open_group_buy_batch()  — gains p_starts_at / p_ends_at so the open form can
--                               set the window in one shot.
--   * set_group_buy_schedule() — edit the window on an existing batch (admin only).
--   * get_group_buy_progress() — batch envelope now carries starts_at / ends_at so
--                               the public storefront hero can read them.
--
-- Idempotent where practical; safe to re-run in the Supabase SQL editor.

-- ===========================================================================
-- 1. Schema
-- ===========================================================================
ALTER TABLE public.group_buy_batches
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at   TIMESTAMPTZ;

-- ===========================================================================
-- 2. open_group_buy_batch — accept the announced window on creation.
--    Drop the prior 2-arg version so the named-arg RPC call stays unambiguous.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.open_group_buy_batch(TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.open_group_buy_batch(
  p_name       TEXT        DEFAULT NULL,
  p_access_fee NUMERIC     DEFAULT NULL,
  p_starts_at  TIMESTAMPTZ DEFAULT NULL,
  p_ends_at    TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.group_buy_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.group_buy_batches%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to open a group buy batch.';
  END IF;

  IF p_access_fee IS NOT NULL AND p_access_fee < 0 THEN
    RAISE EXCEPTION 'Access fee cannot be negative.';
  END IF;

  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Finish date must be after the start date.';
  END IF;

  -- Close any currently-open batch first so the new one can take the open slot.
  UPDATE public.group_buy_batches
     SET status = 'closed', closed_at = NOW()
   WHERE status = 'open';

  INSERT INTO public.group_buy_batches (name, opened_by, access_fee, starts_at, ends_at)
  VALUES (
    NULLIF(TRIM(COALESCE(p_name, '')), ''),
    auth.uid(),
    COALESCE(p_access_fee, 250),
    p_starts_at,
    p_ends_at
  )
  RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.open_group_buy_batch(TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_group_buy_batch(TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;

-- ===========================================================================
-- 3. set_group_buy_schedule — edit the window on an existing batch.
--    Either bound may be NULL (open-ended start, or no deadline).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.set_group_buy_schedule(
  p_id        UUID,
  p_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_ends_at   TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.group_buy_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.group_buy_batches%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to set a group buy schedule.';
  END IF;

  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Finish date must be after the start date.';
  END IF;

  UPDATE public.group_buy_batches
     SET starts_at = p_starts_at,
         ends_at   = p_ends_at
   WHERE id = p_id
  RETURNING * INTO v_batch;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Batch % not found.', p_id;
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.set_group_buy_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_group_buy_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;

-- ===========================================================================
-- 4. get_group_buy_progress — surface starts_at / ends_at in the batch envelope.
--    Only the RETURN jsonb_build_object changes vs. the lifecycle migration; the
--    rest of the body is preserved verbatim.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_group_buy_progress(p_batch_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.group_buy_batches%ROWTYPE;
  v_items JSONB;
BEGIN
  IF p_batch_id IS NULL THEN
    SELECT * INTO v_batch
    FROM public.group_buy_batches
    WHERE status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
  ELSE
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Not authorized to read this batch.';
    END IF;
    SELECT * INTO v_batch FROM public.group_buy_batches WHERE id = p_batch_id;
  END IF;

  IF v_batch.id IS NULL THEN
    RETURN jsonb_build_object('batch', NULL, 'items', '[]'::jsonb);
  END IF;

  WITH order_totals AS (
    SELECT
      (elem->>'product_id')                                                        AS product_id,
      MAX(elem->>'product_name')                                                   AS product_name,
      COALESCE(SUM((elem->>'quantity')::numeric)
               FILTER (WHERE o.order_status <> 'cancelled'), 0)                     AS total_quantity,
      COUNT(DISTINCT o.id)
               FILTER (WHERE o.order_status <> 'cancelled')                         AS order_count,
      COALESCE(SUM((elem->>'quantity')::numeric)
               FILTER (WHERE o.order_status = 'cancelled'), 0)                      AS cancelled_quantity
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.order_items) AS elem
    WHERE o.group_buy_batch_id = v_batch.id
      AND (elem->>'product_id') IS NOT NULL
    GROUP BY (elem->>'product_id')
  ),
  combined AS (
    SELECT
      COALESCE(ot.product_id, c.product_id::text)       AS product_id,
      COALESCE(ot.product_name, p.name)                 AS product_name,
      COALESCE(ot.total_quantity, 0)                    AS total_quantity,
      COALESCE(ot.order_count, 0)                       AS order_count,
      COALESCE(ot.cancelled_quantity, 0)                AS cancelled_quantity,
      c.cap_quantity                                    AS cap_quantity
    FROM order_totals ot
    FULL OUTER JOIN public.group_buy_caps c
      ON c.batch_id = v_batch.id AND c.product_id::text = ot.product_id
    LEFT JOIN public.products p
      ON p.id::text = COALESCE(ot.product_id, c.product_id::text)
  )
  SELECT jsonb_agg(
           jsonb_build_object(
             'product_id',         product_id,
             'product_name',       product_name,
             'total_quantity',     total_quantity,
             'order_count',        order_count,
             'cancelled_quantity', cancelled_quantity,
             'cap_quantity',       cap_quantity
           )
           ORDER BY product_name NULLS LAST
         )
  INTO v_items
  FROM combined;

  RETURN jsonb_build_object(
    'batch', jsonb_build_object(
      'id',                v_batch.id,
      'batch_number',      v_batch.batch_number,
      'name',              v_batch.name,
      'status',            v_batch.status,
      'opened_at',         v_batch.opened_at,
      'closed_at',         v_batch.closed_at,
      'finalized_at',      v_batch.finalized_at,
      'fulfillment_stage', v_batch.fulfillment_stage,
      'starts_at',         v_batch.starts_at,
      'ends_at',           v_batch.ends_at
    ),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_group_buy_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_buy_progress(UUID) TO anon, authenticated;
