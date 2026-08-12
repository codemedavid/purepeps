import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260812130000_storefront_notice_management.sql'),
  'utf8',
);

describe('storefront notice management migration', () => {
  it('creates typed notice and versioned aggregate tables behind admin RLS', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.storefront_notices');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.storefront_notice_stats');
    expect(sql).toContain('ALTER TABLE public.storefront_notices ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('USING (public.is_admin()) WITH CHECK (public.is_admin())');
    expect(sql).toContain('PRIMARY KEY (notice_id, version)');
  });

  it('returns only the highest eligible published notice using server time', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_active_storefront_notice');
    expect(sql).toContain("WHERE n.status = 'published'");
    expect(sql).toContain('n.starts_at <= now()');
    expect(sql).toContain('n.ends_at > now()');
    expect(sql).toContain('ORDER BY n.priority DESC, n.published_at DESC, n.id');
    expect(sql).toContain('LIMIT 1');
  });

  it('restricts anonymous analytics to two aggregate event names', () => {
    expect(sql).toContain("p_event NOT IN ('impression', 'acknowledgement')");
    expect(sql).toContain('ON CONFLICT (notice_id, version) DO UPDATE SET');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_storefront_notice_event');
    expect(sql).not.toContain('GRANT SELECT ON public.storefront_notice_stats TO anon');
  });

  it('preserves legacy content and disabled state without deleting rollback keys', () => {
    expect(sql).toContain("id = 'storefront_notice_enabled'");
    expect(sql).toContain("CASE WHEN enabled = 'false' THEN 'archived' ELSE 'published' END");
    expect(sql).toContain("coalesce(title, 'Important Notice')");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.site_settings/i);
  });
});
