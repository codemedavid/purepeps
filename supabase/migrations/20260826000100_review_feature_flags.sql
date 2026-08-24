-- ===========================================================================
-- Pure Peps — visibility switches for customer reviews (Admin → Features).
--
-- Two independent switches, each ONE `site_settings` row, so no new table,
-- grant or RLS policy is needed (see 20260824000200_feature_visibility_flags):
--
--   feature_reviews_enabled       — the /reviews page and its navigation entry.
--                                   Off hides the page and makes the route
--                                   redirect to the storefront. Reviews are NOT
--                                   deleted; switching it back restores them.
--
--   feature_review_media_enabled  — whether reviewers may attach photos. Read
--                                   by the review form AND enforced server-side
--                                   in submit_product_review, which blanks
--                                   media_urls when this is 'false' regardless
--                                   of what the client sent.
--
-- Both are seeded ON. Missing rows fall back to "enabled" in
-- src/utils/featureFlags.ts, so the site still renders if this is never applied.
--
-- Idempotent: ON CONFLICT DO NOTHING never clobbers a choice an admin has since
-- made, so re-running cannot silently re-enable something they turned off.
-- ===========================================================================

INSERT INTO site_settings (id, value, type, description) VALUES
  (
    'feature_reviews_enabled',
    'true',
    'boolean',
    'When false, Customer Reviews is hidden from the navigation and /reviews redirects to the storefront. Existing reviews are kept.'
  ),
  (
    'feature_review_media_enabled',
    'true',
    'boolean',
    'When false, customers cannot attach photos to a review. Enforced server-side by submit_product_review, not just in the form.'
  )
ON CONFLICT (id) DO NOTHING;
