-- Pure Peps — Fix: an approved member can be wrongly reported as having NO access.
--
-- Since per-batch access shipped, get_access_status resolved the OPEN batch by
-- taking the single most-recent DECISIVE request (ORDER BY updated_at DESC LIMIT 1).
-- That was safe only while a member held one decisive row per batch. Tier upgrades
-- and duplicate/re-submitted requests broke that assumption: a member can now hold
-- an APPROVED request AND, separately, a REJECTED one on the same batch (a declined
-- upgrade, a rejected duplicate, or a different-tier request). When the rejection is
-- the more recently-updated row, the old logic returned 'rejected' → 'none', locking
-- an already-approved member out of checkout ("No approved access found for this
-- email").
--
-- Fix: approval is authoritative for the open batch. If ANY approved request exists
-- for the batch, the member is 'approved' — approval of one request is never
-- overridden by rejection of another. Only when no approval exists do we fall back
-- to pending → rejected(none) → renew. This also fixes the reverse case (a fresh
-- pending re-submission after a rejection now correctly reads 'pending', not 'none').
--
-- get_access_grant already resolves the member's HIGHEST approved tier once status
-- is 'approved', so no change is needed there. Idempotent; safe to re-run.

CREATE OR REPLACE FUNCTION public.get_access_status(p_email text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := lower(trim(coalesce(p_email, '')));
  v_batch_id UUID;
BEGIN
  IF normalized = '' THEN
    RETURN 'none';
  END IF;

  SELECT id INTO v_batch_id
  FROM public.group_buy_batches
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  -- No open batch => nothing is unlockable right now.
  IF v_batch_id IS NULL THEN
    RETURN 'none';
  END IF;

  -- Any approved request for the open batch unlocks it. A member may hold several
  -- requests per batch (upgrades, re-submissions, duplicates); an approval must
  -- never be overridden by the rejection of a DIFFERENT request.
  IF EXISTS (
    SELECT 1 FROM public.access_requests
    WHERE lower(email) = normalized
      AND group_buy_batch_id = v_batch_id
      AND status = 'approved'
  ) THEN
    RETURN 'approved';
  END IF;

  -- No approval yet, but something awaiting review => pending.
  IF EXISTS (
    SELECT 1 FROM public.access_requests
    WHERE lower(email) = normalized
      AND group_buy_batch_id = v_batch_id
      AND status = 'pending'
  ) THEN
    RETURN 'pending';
  END IF;

  -- No approval and nothing pending, but a decision was made => rejected on this batch.
  IF EXISTS (
    SELECT 1 FROM public.access_requests
    WHERE lower(email) = normalized
      AND group_buy_batch_id = v_batch_id
      AND status = 'rejected'
  ) THEN
    RETURN 'none';
  END IF;

  -- No request at all for the open batch — offer renewal if approved on a prior one.
  IF EXISTS (
    SELECT 1 FROM public.access_requests
    WHERE lower(email) = normalized
      AND status = 'approved'
      AND group_buy_batch_id IS DISTINCT FROM v_batch_id
  ) THEN
    RETURN 'renew';
  END IF;

  RETURN 'none';
END;
$$;

REVOKE ALL ON FUNCTION public.get_access_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_access_status(text) TO anon, authenticated;
