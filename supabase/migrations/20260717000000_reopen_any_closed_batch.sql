-- Pure Peps — allow reopening ANY closed group buy, one open at a time.
--
-- Supersedes 20260716000000_reopen_latest_closed_batch.sql, which only let the
-- latest closed batch reopen. The new rule: any closed batch may be reopened;
-- the sole constraint is that just ONE batch may hold the open slot at a time
-- (the one_open_group_buy_batch unique index + the guard below). Removing the
-- max(batch_number) check is the only change from the prior definition.
-- Idempotent; safe to re-run.

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

  -- Only ONE batch may take new orders at a time.
  IF EXISTS (
    SELECT 1 FROM public.group_buy_batches
    WHERE status = 'open' AND id <> p_id
  ) THEN
    RAISE EXCEPTION 'Another batch is already open. Close or finalize it before reopening this one.'
      USING ERRCODE = 'unique_violation';
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
