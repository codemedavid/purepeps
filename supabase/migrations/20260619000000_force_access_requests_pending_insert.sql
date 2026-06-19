-- Pure Peps — close the INSERT-side self-approval hole on access_requests.
--
-- The UPDATE lockdown migration stopped anon from *updating* status, but the
-- INSERT policy was still `WITH CHECK (true)`. Because the storefront ships the
-- public anon key, anyone could POST directly to /rest/v1/access_requests with
-- {email, status:'approved'} and self-approve (or insert status:'rejected' to
-- grief/revoke a victim email), bypassing the approve-access Edge Function
-- entirely. The `status` column default only applies when status is omitted, so
-- it does not stop a caller that supplies status explicitly.
--
-- Fix (defense in depth): a BEFORE INSERT trigger that FORCES status='pending'
-- regardless of input, plus an INSERT policy that only admits pending rows.
-- After this, the only way a row can reach 'approved'/'rejected' is the
-- service-role UPDATE performed by the approve-access function (service role
-- bypasses RLS and this trigger fires on INSERT only).

CREATE OR REPLACE FUNCTION force_access_request_pending()
RETURNS TRIGGER AS $$
BEGIN
  -- Public submissions are always pending; only the admin (service role) decides.
  NEW.status := 'pending';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS force_access_request_pending_on_insert ON access_requests;
CREATE TRIGGER force_access_request_pending_on_insert
  BEFORE INSERT ON access_requests
  FOR EACH ROW
  EXECUTE FUNCTION force_access_request_pending();

-- Belt-and-suspenders: even if the trigger were ever dropped, the policy rejects
-- any insert that tries to set a non-pending status.
DROP POLICY IF EXISTS "access_requests_insert" ON access_requests;
CREATE POLICY "access_requests_insert" ON access_requests
  FOR INSERT TO anon, authenticated WITH CHECK (status = 'pending');
