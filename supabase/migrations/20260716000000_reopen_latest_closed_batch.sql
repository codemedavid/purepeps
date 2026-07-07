-- Pure Peps — allow reopening a CLOSED group buy, but only the latest batch.
--
-- Previously reopen_group_buy_batch only accepted 'finalizing' | 'finalized'
-- (20260624000000_group_buy_lifecycle.sql). Admins now need to revive a batch
-- that was archived too early. To keep history immutable, only the LATEST batch
-- (highest batch_number) may be reopened once closed — an older archived batch
-- stays archived. The one-open-batch guard is unchanged: no other batch may
-- hold the open slot. Idempotent; safe to re-run.

CREATE OR REPLACE FUNCTION public.reopen_group_buy_batch(p_id UUID)
RETURNS public.group_buy_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch  public.group_buy_batches%ROWTYPE;
  v_target public.group_buy_batches%ROWTYPE;
  v_max_batch_number INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to reopen a group buy batch.';
  END IF;

  -- Only ONE batch may take new orders at a time.
  IF EXISTS (
    SELECT 1 FROM public.group_buy_batches
    WHERE status = 'open' AND id <> p_id
  ) THEN
    RAISE EXCEPTION 'Another batch is already open. Close or finalize it before reopening this one.'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT * INTO v_target FROM public.group_buy_batches WHERE id = p_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'That group buy batch no longer exists.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- A closed batch may only be reopened when it is the latest batch, so old
  -- archived batches cannot be revived once a newer batch exists.
  IF v_target.status = 'closed' THEN
    SELECT MAX(batch_number) INTO v_max_batch_number FROM public.group_buy_batches;
    IF v_target.batch_number <> v_max_batch_number THEN
      RAISE EXCEPTION 'Only the latest batch can be reopened once closed.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.group_buy_batches
     SET status = 'open', finalized_at = NULL, closed_at = NULL
   WHERE id = p_id AND status IN ('finalizing', 'finalized', 'closed')
  RETURNING * INTO v_batch;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Only a finalizing, finalized, or closed batch can be reopened.'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_group_buy_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_group_buy_batch(UUID) TO authenticated;
