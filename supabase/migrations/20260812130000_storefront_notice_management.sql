-- Complete, versioned storefront notice management.

CREATE TABLE IF NOT EXISTS public.storefront_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  audience text NOT NULL DEFAULT 'everyone' CHECK (audience IN ('everyone', 'visitor', 'verified_member')),
  page_ids text[] NOT NULL DEFAULT ARRAY['storefront.menu']::text[],
  frequency text NOT NULL DEFAULT 'every_visit' CHECK (frequency IN ('once', 'session', 'every_visit')),
  style text NOT NULL DEFAULT 'warning' CHECK (style IN ('info', 'warning', 'success', 'critical')),
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  highlight text NOT NULL DEFAULT '',
  policy_title text NOT NULL DEFAULT '',
  policy_lines text NOT NULL DEFAULT '',
  button_label text NOT NULL DEFAULT '',
  footer_note text NOT NULL DEFAULT '',
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storefront_notices_schedule_order CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at
  ),
  CONSTRAINT storefront_notices_has_page CHECK (cardinality(page_ids) > 0)
);

CREATE TABLE IF NOT EXISTS public.storefront_notice_stats (
  notice_id uuid NOT NULL REFERENCES public.storefront_notices(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  impression_count bigint NOT NULL DEFAULT 0 CHECK (impression_count >= 0),
  acknowledgement_count bigint NOT NULL DEFAULT 0 CHECK (acknowledgement_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, version)
);

CREATE INDEX IF NOT EXISTS storefront_notices_public_match_idx
  ON public.storefront_notices (status, priority DESC, published_at DESC);

DROP TRIGGER IF EXISTS update_storefront_notices_updated_at ON public.storefront_notices;
CREATE TRIGGER update_storefront_notices_updated_at
  BEFORE UPDATE ON public.storefront_notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.storefront_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storefront_notice_stats ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.storefront_notices FROM anon;
REVOKE ALL ON public.storefront_notice_stats FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storefront_notices TO authenticated;
GRANT SELECT ON public.storefront_notice_stats TO authenticated;

DROP POLICY IF EXISTS storefront_notices_admin_all ON public.storefront_notices;
CREATE POLICY storefront_notices_admin_all ON public.storefront_notices
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS storefront_notice_stats_admin_read ON public.storefront_notice_stats;
CREATE POLICY storefront_notice_stats_admin_read ON public.storefront_notice_stats
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.get_active_storefront_notice(
  p_page_id text,
  p_audience text
)
RETURNS TABLE (
  id uuid,
  version integer,
  priority integer,
  starts_at timestamptz,
  ends_at timestamptz,
  audience text,
  page_ids text[],
  frequency text,
  style text,
  title text,
  subtitle text,
  body text,
  highlight text,
  policy_title text,
  policy_lines text,
  button_label text,
  footer_note text,
  published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.id, n.version, n.priority, n.starts_at, n.ends_at, n.audience,
    n.page_ids, n.frequency, n.style, n.title, n.subtitle, n.body,
    n.highlight, n.policy_title, n.policy_lines, n.button_label,
    n.footer_note, n.published_at
  FROM public.storefront_notices n
  WHERE n.status = 'published'
    AND n.published_at IS NOT NULL
    AND (n.starts_at IS NULL OR n.starts_at <= now())
    AND (n.ends_at IS NULL OR n.ends_at > now())
    AND p_page_id = ANY(n.page_ids)
    AND n.audience IN ('everyone', p_audience)
    AND p_audience IN ('visitor', 'verified_member')
  ORDER BY n.priority DESC, n.published_at DESC, n.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.record_storefront_notice_event(
  p_notice_id uuid,
  p_version integer,
  p_event text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event NOT IN ('impression', 'acknowledgement') THEN
    RAISE EXCEPTION 'Unsupported notice event';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.storefront_notices
    WHERE id = p_notice_id AND version = p_version AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'Notice version is not published';
  END IF;

  INSERT INTO public.storefront_notice_stats (
    notice_id, version, impression_count, acknowledgement_count
  ) VALUES (
    p_notice_id,
    p_version,
    CASE WHEN p_event = 'impression' THEN 1 ELSE 0 END,
    CASE WHEN p_event = 'acknowledgement' THEN 1 ELSE 0 END
  )
  ON CONFLICT (notice_id, version) DO UPDATE SET
    impression_count = public.storefront_notice_stats.impression_count
      + CASE WHEN p_event = 'impression' THEN 1 ELSE 0 END,
    acknowledgement_count = public.storefront_notice_stats.acknowledgement_count
      + CASE WHEN p_event = 'acknowledgement' THEN 1 ELSE 0 END,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_storefront_notice(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_storefront_notice_event(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_storefront_notice(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_storefront_notice_event(uuid, integer, text) TO anon, authenticated;

-- Preserve the existing single notice exactly once. Explicit blanks remain blank;
-- missing legacy rows receive the application defaults.
WITH legacy AS (
  SELECT
    max(value) FILTER (WHERE id = 'storefront_notice_enabled') AS enabled,
    max(value) FILTER (WHERE id = 'storefront_notice_title') AS title,
    max(value) FILTER (WHERE id = 'storefront_notice_subtitle') AS subtitle,
    max(value) FILTER (WHERE id = 'storefront_notice_body') AS body,
    max(value) FILTER (WHERE id = 'storefront_notice_highlight') AS highlight,
    max(value) FILTER (WHERE id = 'storefront_notice_policy_title') AS policy_title,
    max(value) FILTER (WHERE id = 'storefront_notice_policy_lines') AS policy_lines,
    max(value) FILTER (WHERE id = 'storefront_notice_button_label') AS button_label,
    max(value) FILTER (WHERE id = 'storefront_notice_footer_note') AS footer_note
  FROM public.site_settings
)
INSERT INTO public.storefront_notices (
  internal_name, status, page_ids, frequency, style, title, subtitle, body,
  highlight, policy_title, policy_lines, button_label, footer_note,
  published_at, archived_at
)
SELECT
  'Research-use legal notice',
  CASE WHEN enabled = 'false' THEN 'archived' ELSE 'published' END,
  ARRAY['storefront.menu', 'storefront.cart', 'storefront.checkout', 'storefront.access'],
  'every_visit',
  'warning',
  coalesce(title, 'Important Notice'),
  coalesce(subtitle, 'Please read before continuing'),
  coalesce(body, E'Sold strictly for research purposes only, not FDA-approved, and are not intended to diagnose, treat, cure, or prevent any disease.\n\nImproper handling or use may carry risks, including possible side effects, adverse reactions, contamination, or ineffective results.\n\nAlways consult a licensed healthcare professional for health-related decisions.'),
  coalesce(highlight, '✕ NO MEET UPS · NO PICK UPS · NO RUSH ORDERS'),
  coalesce(policy_title, '🚚 Order Today, Deliver Tomorrow Policy'),
  coalesce(policy_lines, E'Taking of orders: Monday - Friday\nCut-off is at 5:00 PM\nNext Day Delivery thru J&T\nWeekend orders will be processed every Monday.'),
  coalesce(button_label, '🛡️ I Understand & Agree'),
  coalesce(footer_note, 'This notice is shown on every visit to the storefront.'),
  CASE WHEN enabled = 'false' THEN NULL ELSE now() END,
  CASE WHEN enabled = 'false' THEN now() ELSE NULL END
FROM legacy
WHERE NOT EXISTS (SELECT 1 FROM public.storefront_notices);
