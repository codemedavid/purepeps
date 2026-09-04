-- ===========================================================================
-- Pure Peps — close the anon read/write hole on the two price-snapshot tables.
--
-- products_price_backup_pv and product_variations_price_backup_pv were created
-- by a one-off snapshot on 2026-06-24. Both shipped with RLS DISABLED and no
-- policies, so the anon key could read AND modify them. Supabase raised this as
-- its only two ERROR-level security advisories.
--
-- The read exposure is mild (prices are semi-public). The real problem is the
-- open WRITE surface: anyone holding the anon key could delete or corrupt the
-- snapshot.
--
-- WHY RLS WITH NO POLICY IS THE RIGHT SHAPE HERE
-- Normally "RLS on, no policies" is a trap — it blocks everyone. It is correct
-- in this case because:
--   * No application code references either table. Verified with a repo-wide
--     search across src/ and supabase/; there are zero hits.
--   * service_role and the table owner BYPASS RLS, so the Supabase SQL editor
--     still reads them. The restore path these snapshots exist for is intact.
--
-- The snapshots are NOT dropped. They are a stale point-in-time record (20 of
-- 102 products and 35 of 177 variations now reference rows that no longer
-- exist), but deleting an owner's data is their decision, not this migration's.
--
-- Reversible: ALTER TABLE ... DISABLE ROW LEVEL SECURITY restores the old
-- behaviour, and the GRANTs can be re-issued.
--
-- Idempotent; safe to re-run.
-- ===========================================================================

ALTER TABLE public.products_price_backup_pv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variations_price_backup_pv ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.products_price_backup_pv FROM anon, authenticated;
REVOKE ALL ON public.product_variations_price_backup_pv FROM anon, authenticated;

COMMENT ON TABLE public.products_price_backup_pv IS
  'One-off product price snapshot taken 2026-06-24. Read-only historical record; no application code reads it. RLS enabled with no policies so only service_role/owner can reach it.';
COMMENT ON TABLE public.product_variations_price_backup_pv IS
  'One-off variation price snapshot taken 2026-06-24. Read-only historical record; no application code reads it. RLS enabled with no policies so only service_role/owner can reach it.';
