-- Pure Peps — backfill two tables whose CREATE-TABLE migrations never reached
-- the remote DB, leaving live code (SmartGuide/GuideManager/ArticleDetail and
-- PromoBanner) pointing at non-existent relations:
--   * guide_topics      (20250117000002_create_guide_topics.sql)
--   * promo_subscribers (20260329000000_create_promo_subscribers.sql)
--
-- Because both tables were absent, the data-plane lockdown migration
-- (20260621000000_lockdown_data_plane.sql) SKIPPED them — every block there is
-- guarded by `IF EXISTS (table)`. So we must not only create the tables but also
-- apply the SAME RLS the lockdown migration produces, using the identical policy
-- names and the is_admin() model. That keeps re-running lockdown a no-op and the
-- schema consistent with the rest of the storefront. Idempotent; safe to re-run.

-- ===========================================================================
-- guide_topics — public-catalog table (mirrors lockdown section 1).
--   anon SELECT only; admin full write via public.is_admin().
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.guide_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  preview TEXT,
  content TEXT NOT NULL,
  cover_image TEXT,
  author TEXT NOT NULL DEFAULT 'SlimDose Team',
  published_date DATE NOT NULL DEFAULT CURRENT_DATE,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.guide_topics IS 'Educational articles for the Smart Guide section';

CREATE INDEX IF NOT EXISTS idx_guide_topics_display_order ON public.guide_topics(display_order);
CREATE INDEX IF NOT EXISTS idx_guide_topics_enabled ON public.guide_topics(is_enabled) WHERE is_enabled = true;

ALTER TABLE public.guide_topics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guide_topics FROM anon;
GRANT SELECT ON public.guide_topics TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_topics TO authenticated;

DROP POLICY IF EXISTS "guide_topics_public_read" ON public.guide_topics;
DROP POLICY IF EXISTS "guide_topics_admin_write" ON public.guide_topics;
-- Drop the legacy permissive policies from the original create migration so they
-- cannot OR-in and re-open writes if that file is ever re-applied.
DROP POLICY IF EXISTS "Public can view enabled articles" ON public.guide_topics;
DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.guide_topics;

CREATE POLICY "guide_topics_public_read" ON public.guide_topics
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "guide_topics_admin_write" ON public.guide_topics
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===========================================================================
-- promo_subscribers — email capture (mirrors lockdown section 5).
--   anon INSERT only; admin read/manage via public.is_admin().
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.promo_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'tbs_promo_popup',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.promo_subscribers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promo_subscribers FROM anon;
GRANT INSERT ON public.promo_subscribers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_subscribers TO authenticated;

DROP POLICY IF EXISTS "promo_subscribers_public_insert" ON public.promo_subscribers;
DROP POLICY IF EXISTS "promo_subscribers_admin_all" ON public.promo_subscribers;
-- Drop the legacy permissive policies from the original create migration.
DROP POLICY IF EXISTS "Allow anonymous inserts" ON public.promo_subscribers;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.promo_subscribers;

CREATE POLICY "promo_subscribers_public_insert" ON public.promo_subscribers
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "promo_subscribers_admin_all" ON public.promo_subscribers
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
