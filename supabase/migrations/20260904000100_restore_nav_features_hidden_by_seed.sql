-- ===========================================================================
-- Pure Peps — restore the three navigation features that 20260824000200 hid.
--
-- Before that migration, feature_calculator_enabled, feature_protocols_enabled
-- and feature_faq_enabled had NO rows in site_settings. featureFlags.ts fails
-- OPEN — only the literal string 'false' disables a feature — so Calculator,
-- Protocols and FAQ were all VISIBLE on the live site.
--
-- 20260824000200 seeded those three as 'false', so applying it switched them
-- off the moment it landed. That value was the seed chosen when the flags were
-- first designed; it was never a decision to hide pages that were already live.
--
-- This restores the pre-migration appearance. Nothing about the switches
-- changes: an admin can turn any of them off again in Admin → Features, and
-- doing so deletes no content.
--
-- DELIBERATELY NOT TOUCHED: coa_page_enabled (Lab Reports). That row already
-- existed and already held 'false' BEFORE any migration in this session, so it
-- reflects a choice someone made earlier. Flipping it here would overwrite a
-- real decision rather than undo an accident.
--
-- Safe to re-run, but note it is an UPDATE, not a seed: re-running re-enables
-- these three. If an admin has since switched one off on purpose, do not replay
-- this migration.
-- ===========================================================================

UPDATE public.site_settings
   SET value = 'true',
       updated_at = now()
 WHERE id IN (
   'feature_calculator_enabled',
   'feature_protocols_enabled',
   'feature_faq_enabled'
 );
