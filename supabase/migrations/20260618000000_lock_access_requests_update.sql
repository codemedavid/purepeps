-- Pure Peps — lock down access-request approvals to the admin only.
--
-- The original access_requests migration granted anon/authenticated a permissive
-- UPDATE policy (USING true), which let ANY anonymous visitor approve their own
-- request via the REST API. The storefront has no Supabase Auth, so we instead
-- remove the UPDATE policy entirely: with RLS enabled and no UPDATE policy,
-- anon/authenticated UPDATEs are denied. The ONLY way to change a request's
-- status is now the `approve-access` Edge Function, which uses the service-role
-- key (which bypasses RLS) after validating the admin password.
--
-- INSERT (public payment submission) and SELECT (email verification) policies
-- from the create migration are intentionally left in place.

DROP POLICY IF EXISTS "access_requests_update" ON access_requests;

-- No replacement UPDATE policy: status changes go through the service role only.
