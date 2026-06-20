-- Pure Peps — Per-batch group-buy access.
--
-- Until now, access was a LIFETIME unlock: get_access_status(email) returned
-- 'approved' if the email was EVER approved, so one access payment unlocked
-- checkout on every future batch. This migration scopes access to a single
-- group-buy batch, so each new batch requires its own paid access request +
-- admin approval — mirroring how orders are tagged to the open batch.
--
--   * group_buy_batches.access_fee     — admin-set fee per batch (default 250).
--   * access_requests.group_buy_batch_id — the batch a request unlocks. A
--                          BEFORE INSERT trigger stamps it to the open batch,
--                          ignoring any client value (same shape as the orders
--                          enforce trigger and force_access_requests_pending).
--   * get_access_status()  — now batch-scoped; adds a 'renew' state for a member
--                          approved on a PRIOR batch but not the open one.
--   * get_active_access_info() — open batch number + fee for the storefront.
--
-- Backfill keeps current members whole: every existing access request is tagged
-- to the currently-open batch, so already-approved members stay unlocked for it
-- and only re-pay starting from the NEXT batch.
--
-- Idempotent where practical; safe to re-run in the Supabase SQL editor.

-- ===========================================================================
-- 1. Schema
-- ===========================================================================
ALTER TABLE public.group_buy_batches
  ADD COLUMN IF NOT EXISTS access_fee NUMERIC(10,2) NOT NULL DEFAULT 250;

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS group_buy_batch_id UUID REFERENCES public.group_buy_batches(id);

CREATE INDEX IF NOT EXISTS access_requests_batch_id_idx
  ON public.access_requests (group_buy_batch_id);

-- Compound lookup used by get_access_status (email + batch).
CREATE INDEX IF NOT EXISTS access_requests_email_batch_idx
  ON public.access_requests (LOWER(email), group_buy_batch_id);

-- ===========================================================================
-- 2. Insert-shaping trigger — stamp every new request to the open batch.
--    SECURITY DEFINER because it reads group_buy_batches, which anon cannot
--    SELECT. Ignores any client-supplied group_buy_batch_id (defense in depth),
--    exactly like enforce_group_buy_on_order force-sets orders.group_buy_batch_id.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.tag_access_request_batch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
BEGIN
  SELECT id INTO v_batch_id
  FROM public.group_buy_batches
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  -- May be NULL if no batch is open; the request is still recorded but unlocks
  -- nothing until a batch opens and the member resubmits.
  NEW.group_buy_batch_id := v_batch_id;
  RETURN NEW;
END;
$$;

-- Trigger function only — keep it off the PostgREST RPC surface.
REVOKE ALL ON FUNCTION public.tag_access_request_batch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tag_access_request_batch ON public.access_requests;
CREATE TRIGGER trg_tag_access_request_batch
  BEFORE INSERT ON public.access_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.tag_access_request_batch();

-- ===========================================================================
-- 3. Backfill — keep current members whole on the open batch.
--    Guard: exactly one open batch must exist, else abort rather than tag rows
--    to the wrong (or no) batch and silently lock members out.
-- ===========================================================================
DO $$
DECLARE
  v_open_count INT;
  v_batch_id UUID;
BEGIN
  SELECT count(*) INTO v_open_count FROM public.group_buy_batches WHERE status = 'open';

  IF v_open_count = 1 THEN
    SELECT id INTO v_batch_id FROM public.group_buy_batches WHERE status = 'open';
    UPDATE public.access_requests
       SET group_buy_batch_id = v_batch_id
     WHERE group_buy_batch_id IS NULL;
  ELSIF v_open_count = 0 THEN
    RAISE WARNING 'No open batch — leaving access_requests.group_buy_batch_id NULL; members must resubmit when a batch opens.';
  ELSE
    RAISE EXCEPTION 'Expected exactly one open batch for backfill, found %.', v_open_count;
  END IF;
END $$;

-- ===========================================================================
-- 4. Batch-scoped access status (replaces the lifetime check).
--    Returns 'approved' | 'pending' | 'renew' | 'none' for the OPEN batch:
--      approved — an approved request exists for the open batch
--      pending  — a pending request exists for the open batch (none decided)
--      renew    — no request for the open batch, but approved on a prior batch
--      none     — never approved, or explicitly rejected on the open batch
-- ===========================================================================
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
  decisive text;
  has_pending boolean;
  approved_elsewhere boolean;
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

  -- Most-recent decisive request FOR THIS BATCH wins.
  SELECT status INTO decisive
  FROM public.access_requests
  WHERE lower(email) = normalized
    AND group_buy_batch_id = v_batch_id
    AND status IN ('approved', 'rejected')
  ORDER BY updated_at DESC
  LIMIT 1;

  IF decisive = 'approved' THEN RETURN 'approved'; END IF;
  IF decisive = 'rejected' THEN RETURN 'none'; END IF;

  -- Pending for this batch?
  SELECT EXISTS (
    SELECT 1 FROM public.access_requests
    WHERE lower(email) = normalized
      AND group_buy_batch_id = v_batch_id
      AND status = 'pending'
  ) INTO has_pending;

  IF has_pending THEN RETURN 'pending'; END IF;

  -- No request for the open batch — was this member approved on another batch?
  SELECT EXISTS (
    SELECT 1 FROM public.access_requests
    WHERE lower(email) = normalized
      AND status = 'approved'
      AND group_buy_batch_id IS DISTINCT FROM v_batch_id
  ) INTO approved_elsewhere;

  RETURN CASE WHEN approved_elsewhere THEN 'renew' ELSE 'none' END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_access_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_access_status(text) TO anon, authenticated;

-- ===========================================================================
-- 5. Open batch access info (number + fee) for the storefront.
--    PII-free, so anon may call it; powers the dynamic access fee in GetAccess.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_active_access_info()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.group_buy_batches%ROWTYPE;
BEGIN
  SELECT * INTO v_batch
  FROM public.group_buy_batches
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_batch.id IS NULL THEN
    RETURN jsonb_build_object('batch_number', NULL, 'access_fee', NULL, 'name', NULL);
  END IF;

  RETURN jsonb_build_object(
    'batch_number', v_batch.batch_number,
    'access_fee',   v_batch.access_fee,
    'name',         v_batch.name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_access_info() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_access_info() TO anon, authenticated;

-- ===========================================================================
-- 6. Let admins set the access fee when opening a batch.
--    Drop the 1-arg version first so the named-arg RPC call is unambiguous.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.open_group_buy_batch(TEXT);

CREATE OR REPLACE FUNCTION public.open_group_buy_batch(
  p_name TEXT DEFAULT NULL,
  p_access_fee NUMERIC DEFAULT NULL
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

  -- Close any currently-open batch first so the new one can take the open slot.
  UPDATE public.group_buy_batches
     SET status = 'closed', closed_at = NOW()
   WHERE status = 'open';

  INSERT INTO public.group_buy_batches (name, opened_by, access_fee)
  VALUES (
    NULLIF(TRIM(COALESCE(p_name, '')), ''),
    auth.uid(),
    COALESCE(p_access_fee, 250)
  )
  RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.open_group_buy_batch(TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_group_buy_batch(TEXT, NUMERIC) TO authenticated;
