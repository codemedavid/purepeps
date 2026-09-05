-- ===========================================================================
-- Turn the storefront pop-up OFF by default.
--
-- The homepage is now a single Group Buy landing section, and a blocking
-- acknowledgement modal must not open by itself when a visitor arrives.
--
-- The feature is NOT deleted. Nothing here drops a table, a policy or a row:
-- published notices are ARCHIVED, which keeps every string in the Notice
-- Manager and leaves them one click from being republished. The companion
-- code change removes the hard-coded fallback in
-- src/hooks/useStorefrontNotice.ts, which used to re-open the research-use
-- notice on every storefront visit even with nothing published and
-- storefront_notice_enabled = 'false' -- i.e. the admin's own switch could not
-- actually turn the pop-up off. After both changes a published row is the only
-- thing that opens the modal.
--
-- The research-use disclaimer itself is unaffected: it still ships in the site
-- footer ("Research use only - not for human consumption").
--
-- Idempotent: re-running archives nothing new once no published storefront
-- notice remains.
-- ===========================================================================

-- 1. Archive any notice currently published to a storefront page. A notice
--    targeting only a standalone page (FAQ, Lab Reports, ...) is left alone:
--    it never appeared on the homepage, so it is not what is being turned off.
UPDATE public.storefront_notices
SET
  status = 'archived',
  archived_at = COALESCE(archived_at, now()),
  updated_at = now()
WHERE status = 'published'
  AND page_ids && ARRAY[
    'storefront.landing',
    'storefront.menu',
    'storefront.cart',
    'storefront.checkout',
    'storefront.access'
  ]::text[];

-- 2. Respect the pre-existing admin toggle by setting it to its OFF value, so
--    the stored configuration agrees with what the site now does. Unlike the
--    seeds elsewhere in this directory this deliberately overwrites on
--    conflict: the whole point of the migration is to move the switch.
INSERT INTO site_settings (id, value, type, description) VALUES (
  'storefront_notice_enabled',
  'false',
  'boolean',
  'When true, the storefront shows the Important Notice modal. Turned off by default: a notice must be published from Admin -> Settings -> Notice Manager to appear.'
)
ON CONFLICT (id) DO UPDATE SET
  value = 'false',
  description = EXCLUDED.description,
  updated_at = now();
