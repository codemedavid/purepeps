# TDD Evidence — Backfill Missing Migrations (guide_topics, promo_subscribers)

**Date:** 2026-06-20
**Task:** Find modules whose migrations never reached the remote DB and fix them.

## Method

Cross-referenced every Postgres object the app touches (`.from(...)` tables and
`.rpc(...)` functions, extracted from `src/`) against the live remote schema via
the Supabase MCP. This audit *is* the test: RED = a referenced object is absent;
GREEN = every referenced object resolves.

## Findings

- 13/13 RPC functions referenced in code already existed on remote. ✅
- 15/17 referenced tables existed. **2 were missing**, both with local
  CREATE-TABLE migration files that were never applied remotely:
  - `guide_topics` — `20250117000002_create_guide_topics.sql` (used by
    SmartGuide / GuideManager / ArticleDetail)
  - `promo_subscribers` — `20260329000000_create_promo_subscribers.sql` (used by
    PromoBanner)
- Root cause: because both tables were absent, the data-plane lockdown migration
  (`20260621000000_lockdown_data_plane.sql`) **skipped** their hardening — every
  block there is guarded by `IF EXISTS (table)`. `guide_topics` is even listed in
  its catalog array (line 64) and `promo_subscribers` has a dedicated section 5.

## Fix

New migration `20260625000000_create_missing_guide_promo_tables.sql` creates both
tables **and** applies the exact RLS the lockdown migration produces (same policy
names, `public.is_admin()` admin model), so re-running lockdown stays a no-op and
the schema is consistent with the rest of the storefront. Idempotent.

## Evidence

| # | Guarantee | Validation | Result |
|---|-----------|-----------|--------|
| 1 | Both tables were absent before fix | `SELECT ... information_schema.tables IN ('guide_topics','promo_subscribers')` → `present_tables = null` | RED |
| 2 | Both tables exist with RLS + correct policies after fix | `SELECT relrowsecurity, pg_policy ...` → `guide_topics{public_read,admin_write}`, `promo_subscribers{public_insert,admin_all}`, `rls_enabled=true` | GREEN |
| 3 | No code-referenced table is missing | cross-ref query over all 17 `.from()` tables → `[]` (empty) | GREEN |
| 4 | No new security regressions | `get_advisors(security)` → only finding on changed objects is `promo_subscribers_public_insert WITH CHECK(true)`, which is the intended anon email-capture policy (identical to lockdown §5 and `orders_public_insert`) | PASS |

## Known gaps

- SmartGuide / GuideManager / ArticleDetail / PromoBanner are not currently wired
  into `App.tsx` routes. Tables are now backfilled so the schema matches the code
  if/when these components are mounted; no app behavior changed by this migration.
- Remote `supabase_migrations` history only records the recent group-buy era
  migrations; the base schema was applied out-of-band earlier. Not corrected here
  (all referenced objects exist); noted for awareness.
