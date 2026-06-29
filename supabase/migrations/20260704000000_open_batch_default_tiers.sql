-- Pure Peps — Default a new batch's offered tiers to the server's active set.
--
-- Opening a batch used to require the admin to pick which tiers it offers (and
-- a NULL/empty selection left checkout locked). We now default the access tiers
-- to the SERVER default: every active tier in the global library, at each tier's
-- own price. The open form no longer asks the admin to choose tiers or prices.
--
-- Behaviour change is confined to open_group_buy_batch when p_tier_ids IS NULL:
--   * before — no batch_tiers rows were created (checkout stayed locked).
--   * after  — every active tier is linked to the new batch (the default set).
-- An explicit non-NULL p_tier_ids still wins, so set_batch_tiers and any future
-- per-batch overrides keep working unchanged.
--
-- Idempotent (CREATE OR REPLACE); safe to re-run in the Supabase SQL editor.

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

  -- Offer tiers on this batch. An explicit selection wins; a NULL selection now
  -- defaults to the SERVER default — every active tier at its own price — so the
  -- open form needs no tier/price input. Unknown ids in an explicit list are
  -- ignored.
  IF p_tier_ids IS NOT NULL THEN
    INSERT INTO public.batch_tiers (group_buy_batch_id, tier_id)
    SELECT v_batch.id, tid
    FROM unnest(p_tier_ids) AS tid
    WHERE EXISTS (SELECT 1 FROM public.tiers t WHERE t.id = tid AND t.active = TRUE)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.batch_tiers (group_buy_batch_id, tier_id)
    SELECT v_batch.id, t.id
    FROM public.tiers t
    WHERE t.active = TRUE
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.open_group_buy_batch(TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, UUID[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_group_buy_batch(TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, UUID[])
  TO authenticated;
