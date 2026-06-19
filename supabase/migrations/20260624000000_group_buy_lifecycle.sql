-- Pure Peps — Group Buy lifecycle state machine.
--
-- Extends the batch status from the original open/closed pair to a real
-- operating cycle:
--
--   open  ──▶ finalizing ──▶ finalized ──▶ closed
--    │            │
--    └────────────┘  (reopen — admin escape hatch)
--
--   * open       — accepting NEW customer orders (checkout enabled). Exactly one
--                  at a time (one_open_group_buy_batch unique index, unchanged).
--   * finalizing — ordering window closed to new customers; admin confirms each
--                  order and cancels no-shows. Leftover (capped) units freed by
--                  cancellation become claimable by existing customers.
--   * finalized  — totals locked, supplier bulk order placed; admin drives
--                  delivery (batch fulfillment_stage + per-order local leg).
--   * closed     — archived / complete.
--
-- Because the storefront checkout trigger and cap RPC key on status='open',
-- moving a batch off 'open' automatically disables new checkout — exactly the
-- "ordering window closed" behaviour we want, with no client change required.
--
-- Mirrors existing patterns: SECURITY DEFINER + explicit is_admin() guard on
-- every state transition (admin_auth_roles.sql), and the privacy-preserving
-- definer-RPC style of get_group_buy_progress. Idempotent; safe to re-run.

-- ===========================================================================
-- 1. Status state machine + finalized timestamp.
-- ===========================================================================
ALTER TABLE public.group_buy_batches
  DROP CONSTRAINT IF EXISTS group_buy_batches_status_check;

ALTER TABLE public.group_buy_batches
  ADD CONSTRAINT group_buy_batches_status_check
  CHECK (status IN ('open', 'finalizing', 'finalized', 'closed'));

ALTER TABLE public.group_buy_batches
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

-- The one_open_group_buy_batch partial unique index (WHERE status='open') is
-- intentionally unchanged: only ONE batch may take new orders at a time, while
-- any number of past batches can be mid-fulfilment.

-- ===========================================================================
-- 2. Transition RPCs. SECURITY DEFINER so they only act for admins and can move
--    state without tripping the one-open-batch index.
-- ===========================================================================

-- open -> finalizing. Closes the storefront ordering window for this batch.
CREATE OR REPLACE FUNCTION public.start_finalizing_batch(p_id UUID)
RETURNS public.group_buy_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.group_buy_batches%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to finalize a group buy batch.';
  END IF;

  UPDATE public.group_buy_batches
     SET status = 'finalizing'
   WHERE id = p_id AND status = 'open'
  RETURNING * INTO v_batch;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Only an OPEN batch can move to finalizing (it may already be finalizing or closed).'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.start_finalizing_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_finalizing_batch(UUID) TO authenticated;

-- finalizing -> finalized. Locks totals + claims; delivery management begins.
CREATE OR REPLACE FUNCTION public.finalize_group_buy_batch(p_id UUID)
RETURNS public.group_buy_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.group_buy_batches%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to finalize a group buy batch.';
  END IF;

  UPDATE public.group_buy_batches
     SET status = 'finalized', finalized_at = NOW()
   WHERE id = p_id AND status = 'finalizing'
  RETURNING * INTO v_batch;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Only a FINALIZING batch can be finalized.'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_group_buy_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_group_buy_batch(UUID) TO authenticated;

-- finalizing|finalized -> open. Escape hatch (e.g. finalized too early). Only
-- allowed when no OTHER batch currently holds the single open slot.
CREATE OR REPLACE FUNCTION public.reopen_group_buy_batch(p_id UUID)
RETURNS public.group_buy_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.group_buy_batches%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to reopen a group buy batch.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_buy_batches
    WHERE status = 'open' AND id <> p_id
  ) THEN
    RAISE EXCEPTION 'Another batch is already open. Close or finalize it before reopening this one.'
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.group_buy_batches
     SET status = 'open', finalized_at = NULL, closed_at = NULL
   WHERE id = p_id AND status IN ('finalizing', 'finalized')
  RETURNING * INTO v_batch;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Only a finalizing or finalized batch can be reopened.'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_group_buy_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_group_buy_batch(UUID) TO authenticated;

-- Replace close_group_buy_batch: archive from ANY non-closed state (was 'open'
-- only). Lets the admin close out a finalized batch once delivery is complete,
-- and still serves as an escape hatch from open/finalizing.
CREATE OR REPLACE FUNCTION public.close_group_buy_batch(p_id UUID)
RETURNS public.group_buy_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.group_buy_batches%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to close a group buy batch.';
  END IF;

  UPDATE public.group_buy_batches
     SET status = 'closed', closed_at = NOW()
   WHERE id = p_id AND status <> 'closed'
  RETURNING * INTO v_batch;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'That group buy batch is not open (it may already have been closed).'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.close_group_buy_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_group_buy_batch(UUID) TO authenticated;

-- ===========================================================================
-- 3. Cancellation-aware progress.
--    Cancelled orders must NOT hold a unit — that is the whole point of the
--    leftover-claim feature ("customers can take over cancelled units"). So
--    total_quantity / order_count now count NON-cancelled orders only, and the
--    freed units surface as cancelled_quantity for admin visibility. Storefront
--    remaining (cap - total_quantity) therefore reflects truly reserved units.
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
      'fulfillment_stage', v_batch.fulfillment_stage
    ),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_group_buy_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_buy_progress(UUID) TO anon, authenticated;
