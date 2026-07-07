-- ===========================================================================
-- Corrective: set_group_buy_pasalo_mode wrote updated_at, a column that does
-- NOT exist on group_buy_batches (only group_buy_caps has one — see
-- 20260622000000_create_group_buy_batches.sql). The bad UPDATE raised
-- Postgres 42703 and 400'd the admin dashboard toggle. Drop the assignment;
-- the table intentionally tracks no update timestamp. Idempotent.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.set_group_buy_pasalo_mode(
  p_id      UUID,
  p_enabled BOOLEAN
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
    RAISE EXCEPTION 'Not authorized to set pasalo mode.';
  END IF;

  UPDATE public.group_buy_batches
     SET pasalo_mode = COALESCE(p_enabled, false)
   WHERE id = p_id
  RETURNING * INTO v_batch;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Batch % not found.', p_id;
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.set_group_buy_pasalo_mode(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_buy_pasalo_mode(UUID, BOOLEAN) TO authenticated;
