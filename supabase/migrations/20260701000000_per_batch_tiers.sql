-- Pure Peps — Per-batch access tiers.
--
-- Tiers are a reusable GLOBAL library (name, price, categories). Until now every
-- active tier was offered on every batch: get_access_tiers() returned all active
-- tiers regardless of which batch was open. This migration lets the admin choose
-- WHICH tiers a given batch offers, while keeping tiers reusable across batches.
--
--   * batch_tiers            — join table: which tiers each batch offers.
--   * open_group_buy_batch() — gains p_tier_ids so the open form links the chosen
--                              tiers to the new batch in one shot.
--   * set_batch_tiers()      — replace a batch's offered-tier set (admin only), so
--                              a selection can be fixed without reopening a batch.
--   * get_access_tiers()     — now returns only the OPEN batch's offered tiers.
--
-- The access GRANT was already per-batch (access_requests.group_buy_batch_id +
-- tier_id); this only scopes which tiers are OFFERED. get_access_grant and
-- enforce_tier_on_order read a request's tier by id and are unaffected.
--
-- Backfill keeps current members whole: the currently-open batch is linked to
-- every active tier, so the storefront picker shows exactly what it did before.
--
-- Idempotent where practical; safe to re-run in the Supabase SQL editor.

-- ===========================================================================
-- 1. Schema
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.batch_tiers (
  group_buy_batch_id UUID NOT NULL REFERENCES public.group_buy_batches(id) ON DELETE CASCADE,
  tier_id            UUID NOT NULL REFERENCES public.tiers(id) ON DELETE CASCADE,
  PRIMARY KEY (group_buy_batch_id, tier_id)
);

CREATE INDEX IF NOT EXISTS batch_tiers_tier_idx
  ON public.batch_tiers (tier_id);

-- ===========================================================================
-- 2. RLS — catalog-style: anon may SELECT (not PII), admins write. Mirrors the
--    tiers / tier_categories policy shape.
-- ===========================================================================
ALTER TABLE public.batch_tiers ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.batch_tiers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_tiers TO authenticated;

DROP POLICY IF EXISTS "batch_tiers_public_select" ON public.batch_tiers;
CREATE POLICY "batch_tiers_public_select" ON public.batch_tiers
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "batch_tiers_admin_all" ON public.batch_tiers;
CREATE POLICY "batch_tiers_admin_all" ON public.batch_tiers
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===========================================================================
-- 3. Backfill — link the open batch to every active tier so the storefront
--    picker keeps showing the same tiers it did before this migration.
-- ===========================================================================
INSERT INTO public.batch_tiers (group_buy_batch_id, tier_id)
SELECT b.id, t.id
FROM public.group_buy_batches b
CROSS JOIN public.tiers t
WHERE b.status = 'open'
  AND t.active = TRUE
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 4. Storefront: active tiers OFFERED ON THE OPEN BATCH + category ids + price.
--    PII-free, anon-callable. is_all_access tiers return NULL category_ids.
--    (Replaces the global version from the access_tiers migration.)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_access_tiers()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH open_batch AS (
    SELECT id
    FROM public.group_buy_batches
    WHERE status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'description', t.description,
        'price', t.price,
        'is_all_access', t.is_all_access,
        'category_ids',
          CASE
            WHEN t.is_all_access THEN NULL
            ELSE COALESCE((
              SELECT jsonb_agg(tc.category_id ORDER BY tc.category_id)
              FROM public.tier_categories tc
              WHERE tc.tier_id = t.id
            ), '[]'::jsonb)
          END
      )
      ORDER BY t.sort_order, t.price
    ),
    '[]'::jsonb
  )
  FROM public.tiers t
  JOIN public.batch_tiers bt ON bt.tier_id = t.id
  JOIN open_batch ob ON ob.id = bt.group_buy_batch_id
  WHERE t.active = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_access_tiers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_access_tiers() TO anon, authenticated;

-- ===========================================================================
-- 5. open_group_buy_batch — link the chosen tiers to the new batch.
--    Drop the prior 4-arg version so the named-arg RPC call stays unambiguous.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.open_group_buy_batch(TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.open_group_buy_batch(
  p_name       TEXT        DEFAULT NULL,
  p_access_fee NUMERIC     DEFAULT NULL,
  p_starts_at  TIMESTAMPTZ DEFAULT NULL,
  p_ends_at    TIMESTAMPTZ DEFAULT NULL,
  p_tier_ids   UUID[]      DEFAULT NULL
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

  -- Offer the chosen tiers on this batch. Unknown ids are ignored. A NULL/empty
  -- selection leaves the batch with no offered tiers (checkout stays locked until
  -- tiers are set via set_batch_tiers).
  IF p_tier_ids IS NOT NULL THEN
    INSERT INTO public.batch_tiers (group_buy_batch_id, tier_id)
    SELECT v_batch.id, tid
    FROM unnest(p_tier_ids) AS tid
    WHERE EXISTS (SELECT 1 FROM public.tiers t WHERE t.id = tid AND t.active = TRUE)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.open_group_buy_batch(TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, UUID[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_group_buy_batch(TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, UUID[])
  TO authenticated;

-- ===========================================================================
-- 6. set_batch_tiers — replace the offered-tier set on an existing batch.
--    Lets the admin fix a selection without reopening (which would close the
--    batch and force members to re-pay).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.set_batch_tiers(
  p_batch_id UUID,
  p_tier_ids UUID[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to set batch tiers.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.group_buy_batches WHERE id = p_batch_id) THEN
    RAISE EXCEPTION 'Batch % not found.', p_batch_id;
  END IF;

  DELETE FROM public.batch_tiers WHERE group_buy_batch_id = p_batch_id;

  IF p_tier_ids IS NOT NULL THEN
    INSERT INTO public.batch_tiers (group_buy_batch_id, tier_id)
    SELECT p_batch_id, tid
    FROM unnest(p_tier_ids) AS tid
    WHERE EXISTS (SELECT 1 FROM public.tiers t WHERE t.id = tid AND t.active = TRUE)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_batch_tiers(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_batch_tiers(UUID, UUID[]) TO authenticated;
