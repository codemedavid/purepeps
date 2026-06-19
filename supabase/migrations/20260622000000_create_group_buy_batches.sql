-- Pure Peps — Group Buy Batches.
--
-- Formalizes the store's group-buy operating cycle:
--   * group_buy_batches  — exactly one OPEN batch at a time (partial unique index).
--                          Opening a batch auto-closes the previous one and mints
--                          a new monotonic batch_number.
--   * group_buy_caps     — optional per-product purchase cap for a batch.
--   * orders.group_buy_batch_id — every order placed while a batch is open is
--                          server-tagged to that batch (forced by trigger).
--
-- Customer-facing reads go through SECURITY DEFINER RPCs only (orders is locked
-- down: anon has INSERT but no SELECT — see 20260621000000_lockdown_data_plane.sql).
-- get_group_buy_progress() exposes per-product TOTALS + CAPS (no PII) so the
-- storefront can show progress and enforce caps; the BEFORE INSERT trigger on
-- orders is the authoritative backstop for "no open batch => no checkout" and
-- "orders must abide the cap".
--
-- Mirrors existing patterns: is_admin() RLS gate (admin_auth_roles.sql), privacy
-- preserving definer RPCs (get_access_status / increment_promo_usage), and the
-- insert-shaping trigger style of force_access_requests_pending_insert.sql.
-- Idempotent where practical; safe to run in the Supabase SQL editor.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.group_buy_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number BIGINT GENERATED ALWAYS AS IDENTITY,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  name         TEXT,
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at    TIMESTAMPTZ,
  opened_by    UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one open batch, ever. This is the hard guarantee behind "we can only
-- open 1 group buy batch" — independent of any client logic.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_group_buy_batch
  ON public.group_buy_batches (status)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.group_buy_caps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     UUID NOT NULL REFERENCES public.group_buy_batches(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  cap_quantity INTEGER NOT NULL CHECK (cap_quantity > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, product_id)
);

-- Tag orders to the batch they were placed in.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS group_buy_batch_id UUID REFERENCES public.group_buy_batches(id);

CREATE INDEX IF NOT EXISTS orders_group_buy_batch_id_idx
  ON public.orders (group_buy_batch_id);

-- ===========================================================================
-- 2. RLS — admin-only direct access; storefront uses RPCs.
-- ===========================================================================
ALTER TABLE public.group_buy_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.group_buy_batches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_buy_batches TO authenticated;

DROP POLICY IF EXISTS "group_buy_batches_admin_all" ON public.group_buy_batches;
CREATE POLICY "group_buy_batches_admin_all" ON public.group_buy_batches
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.group_buy_caps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.group_buy_caps FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_buy_caps TO authenticated;

DROP POLICY IF EXISTS "group_buy_caps_admin_all" ON public.group_buy_caps;
CREATE POLICY "group_buy_caps_admin_all" ON public.group_buy_caps
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===========================================================================
-- 3. Admin RPCs — open / close batches.
--    SECURITY DEFINER + explicit is_admin() guard so they only act for admins,
--    and so opening can atomically close the previous open batch without
--    tripping the one-open-batch unique index.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.open_group_buy_batch(p_name TEXT DEFAULT NULL)
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

  -- Close any currently-open batch first so the new one can take the open slot.
  UPDATE public.group_buy_batches
     SET status = 'closed', closed_at = NOW()
   WHERE status = 'open';

  INSERT INTO public.group_buy_batches (name, opened_by)
  VALUES (NULLIF(TRIM(COALESCE(p_name, '')), ''), auth.uid())
  RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.open_group_buy_batch(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_group_buy_batch(TEXT) TO authenticated;

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
   WHERE id = p_id AND status = 'open'
  RETURNING * INTO v_batch;

  -- UPDATE ... INTO does not raise on zero matched rows, so a stale/duplicate
  -- close would otherwise look successful. Surface it instead of a phantom OK.
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
-- 4. Public progress RPC — per-product totals + caps for a batch.
--    Returns ONLY product-level aggregates (no customer PII), so anon may call
--    it. With no argument it reports the currently-open batch; an explicit
--    batch id is admin-only (for history views).
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
      (elem->>'product_id')                   AS product_id,
      MAX(elem->>'product_name')              AS product_name,
      SUM((elem->>'quantity')::numeric)       AS total_quantity,
      COUNT(DISTINCT o.id)                     AS order_count
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
      c.cap_quantity                                    AS cap_quantity
    FROM order_totals ot
    FULL OUTER JOIN public.group_buy_caps c
      ON c.batch_id = v_batch.id AND c.product_id::text = ot.product_id
    LEFT JOIN public.products p
      ON p.id::text = COALESCE(ot.product_id, c.product_id::text)
  )
  SELECT jsonb_agg(
           jsonb_build_object(
             'product_id',     product_id,
             'product_name',   product_name,
             'total_quantity', total_quantity,
             'order_count',    order_count,
             'cap_quantity',   cap_quantity
           )
           ORDER BY product_name NULLS LAST
         )
  INTO v_items
  FROM combined;

  RETURN jsonb_build_object(
    'batch', jsonb_build_object(
      'id',           v_batch.id,
      'batch_number', v_batch.batch_number,
      'name',         v_batch.name,
      'status',       v_batch.status,
      'opened_at',    v_batch.opened_at,
      'closed_at',    v_batch.closed_at
    ),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_group_buy_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_buy_progress(UUID) TO anon, authenticated;

-- ===========================================================================
-- 5. Order-insert enforcement (authoritative backstop).
--    Runs as SECURITY DEFINER because it reads sibling orders, which anon
--    cannot SELECT. It (a) rejects orders when no batch is open, (b) force-sets
--    group_buy_batch_id to the open batch (ignoring any client value), and
--    (c) rejects orders that would push a capped product past its cap.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.enforce_group_buy_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  rec RECORD;
BEGIN
  SELECT id INTO v_batch_id
  FROM public.group_buy_batches
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'No active group buy is open. Ordering is currently closed.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Server-authoritative: never trust a client-supplied batch id.
  NEW.group_buy_batch_id := v_batch_id;

  -- Cap math keys on order_items[].product_id, which is client-supplied. Without
  -- this guard a hostile client posting straight to /rest/v1/orders could forge
  -- or omit product_id so the cap subquery sums zero and slips past the cap (and
  -- corrupts the per-product totals). Reject any line item whose product_id is
  -- missing or not a real catalog product. The honest checkout always sends
  -- products.id, so legitimate orders are unaffected.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.order_items) elem
    WHERE NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id::text = (elem->>'product_id')
    )
  ) THEN
    RAISE EXCEPTION 'Order contains an item with an invalid or missing product reference.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialize cap checks per batch so two concurrent orders cannot both slip
  -- past the same cap (TOCTOU). Released at transaction end.
  PERFORM pg_advisory_xact_lock(hashtext('group_buy_cap:' || v_batch_id::text));

  FOR rec IN
    SELECT
      c.cap_quantity,
      COALESCE((
        SELECT SUM((elem->>'quantity')::numeric)
        FROM public.orders o
        CROSS JOIN LATERAL jsonb_array_elements(o.order_items) elem
        WHERE o.group_buy_batch_id = v_batch_id
          AND (elem->>'product_id') = c.product_id::text
      ), 0) AS existing_total,
      COALESCE((
        SELECT SUM((elem->>'quantity')::numeric)
        FROM jsonb_array_elements(NEW.order_items) elem
        WHERE (elem->>'product_id') = c.product_id::text
      ), 0) AS new_total
    FROM public.group_buy_caps c
    WHERE c.batch_id = v_batch_id
  LOOP
    IF rec.new_total > 0 AND (rec.existing_total + rec.new_total) > rec.cap_quantity THEN
      RAISE EXCEPTION 'Group buy limit reached for one of the items in your order (cap %, already reserved %, you requested %).',
        rec.cap_quantity, rec.existing_total, rec.new_total
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- This is a trigger function, never an API endpoint. A trigger still fires
-- after EXECUTE is revoked, so revoke it from every client role to keep it off
-- the PostgREST RPC surface (/rest/v1/rpc/enforce_group_buy_on_order).
REVOKE ALL ON FUNCTION public.enforce_group_buy_on_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_group_buy_on_order ON public.orders;
CREATE TRIGGER trg_enforce_group_buy_on_order
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_group_buy_on_order();

-- ===========================================================================
-- 6. Seed — open an initial batch so checkout keeps working on deploy.
--    (Checkout is now blocked whenever no batch is open.)
-- ===========================================================================
INSERT INTO public.group_buy_batches (name)
SELECT 'Initial Batch'
WHERE NOT EXISTS (
  SELECT 1 FROM public.group_buy_batches WHERE status = 'open'
);
