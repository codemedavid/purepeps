-- ===========================================================================
-- Per-feature visibility switches (Admin → Features).
--
-- Six storefront features can be shown or hidden individually. Each switch is
-- ONE `site_settings` row, so no new table, grant or RLS policy is needed —
-- the storefront already reads `site_settings` anonymously and the admin
-- dashboard already writes to it (see 20260621000000_lockdown_data_plane.sql:
-- anon SELECT, admin write via is_admin()).
--
-- Turning a feature OFF deletes nothing. Products, protocols, FAQs, lab
-- reports and orders are untouched; the row only hides the navigation entry
-- and makes the page redirect to the storefront. Switching it back on
-- restores the feature exactly as it was.
--
-- Initial state, as requested: Calculator, Protocols, Track Order and FAQ are
-- seeded OFF; Products and Lab Reports stay ON.
--
-- Idempotent: ON CONFLICT DO NOTHING never clobbers an admin's later choice,
-- so re-running this migration will not silently re-hide a page someone has
-- since switched back on. Missing rows fall back to "enabled" in
-- src/utils/featureFlags.ts, so the site still renders if this is never
-- applied.
-- ===========================================================================

INSERT INTO site_settings (id, value, type, description) VALUES
  (
    'feature_products_enabled',
    'true',
    'boolean',
    'When false, Products is hidden from the site navigation. The catalog, cart and checkout are unaffected.'
  ),
  (
    'feature_calculator_enabled',
    'false',
    'boolean',
    'When false, the Calculator is hidden from the navigation and /calculator redirects to the storefront.'
  ),
  (
    'feature_protocols_enabled',
    'false',
    'boolean',
    'When false, Protocols is hidden from the navigation and /protocols redirects to the storefront.'
  ),
  (
    'feature_track_order_enabled',
    'false',
    'boolean',
    'When false, Track Order is hidden from the navigation and /track-order redirects to the storefront.'
  ),
  (
    'feature_faq_enabled',
    'false',
    'boolean',
    'When false, the FAQ is hidden from the navigation and /faq redirects to the storefront.'
  ),
  (
    -- Pre-existing key, adopted rather than renamed so any value an admin set
    -- before these controls existed is honoured.
    'coa_page_enabled',
    'true',
    'boolean',
    'When false, Lab Reports is hidden from the navigation and /coa redirects to the storefront.'
  )
ON CONFLICT (id) DO NOTHING;

-- Live-refresh is best-effort: with site_settings in the Realtime publication
-- an admin's toggle reaches open tabs immediately, and without it the change
-- simply lands on the next page load. Guarded so it is safe to re-run and on
-- projects where the publication does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'site_settings'
     )
  THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.site_settings';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipped adding site_settings to supabase_realtime (insufficient privilege).';
END $$;
