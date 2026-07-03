-- Pure Peps — closeable access-request intake.
-- Approval capacity is limited, so admins need to CLOSE new paid access requests
-- while keeping verification working for already-approved members. This adds:
--   1. a site_settings flag `access_requests_open` (default 'true' = open), and
--   2. a BEFORE INSERT trigger on access_requests that rejects EVERY new request
--      (including renewals) while the flag is 'false'.
-- Client-side gating in GetAccess is UX only; this trigger is the real gate.

-- 1. Seed the flag as OPEN. Idempotent: never clobber an admin's chosen value.
INSERT INTO site_settings (id, value, type, description)
VALUES (
  'access_requests_open',
  'true',
  'boolean',
  'When false, new paid access requests are closed (verify-only). Existing approved members keep access.'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Reject new inserts while intake is closed. SECURITY DEFINER so the flag is
--    read with owner privileges regardless of the (anon) caller's RLS grants.
CREATE OR REPLACE FUNCTION enforce_access_requests_open()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  intake_open TEXT;
BEGIN
  SELECT value INTO intake_open
  FROM site_settings
  WHERE id = 'access_requests_open';

  -- Missing flag = open (matches the client default). Only an explicit 'false' closes.
  IF intake_open = 'false' THEN
    RAISE EXCEPTION 'Access requests are currently closed'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_access_requests_open ON access_requests;
CREATE TRIGGER enforce_access_requests_open
  BEFORE INSERT ON access_requests
  FOR EACH ROW
  EXECUTE FUNCTION enforce_access_requests_open();
