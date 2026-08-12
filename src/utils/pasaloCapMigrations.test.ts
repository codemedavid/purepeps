import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const DEFINITION_MARKER = 'CREATE OR REPLACE FUNCTION public.set_group_buy_pasalo_mode(';
const AUTO_CAP_VERSION = 'pasalo-cap-version: next-ten-v1';

function latestPasaloSetter(): { file: string; sql: string } {
  const definitions = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }))
    .filter(({ sql }) => sql.includes(DEFINITION_MARKER));

  const latest = definitions.at(-1);
  if (!latest) throw new Error('No set_group_buy_pasalo_mode migration found');
  return latest;
}

describe('automatic Pasalo cap migration', () => {
  it('installs the next-ten automatic cap behavior as the newest Pasalo setter', () => {
    const latest = latestPasaloSetter();

    expect(latest.sql).toContain(AUTO_CAP_VERSION);
    expect(latest.sql).toContain('pg_advisory_xact_lock');
    expect(latest.sql).toContain('DELETE FROM public.group_buy_caps');
    expect(latest.sql).toContain('INSERT INTO public.group_buy_caps');
    expect(latest.sql).toMatch(/FLOOR\s*\([^)]*\/\s*10\s*\)\s*\+\s*1/is);
  });

  it('scopes generated caps to live demand in the open batch and keeps variations separate', () => {
    const { sql } = latestPasaloSetter();

    expect(sql).toContain("v_batch.status IS DISTINCT FROM 'open'");
    expect(sql).toContain("o.order_status <> 'cancelled'");
    expect(sql).toContain('GROUP BY p.id, pv.id');
    expect(sql).toContain('HAVING SUM((elem->>\'quantity\')::numeric) > 0');
    expect(sql).toContain('pv.product_id = p.id');
  });

  it('disables Pasalo without rebuilding or deleting caps', () => {
    const { sql } = latestPasaloSetter();
    const disableBranch = sql.indexOf('IF NOT v_enabled THEN');
    const capDeletion = sql.indexOf('DELETE FROM public.group_buy_caps');

    expect(disableBranch).toBeGreaterThan(-1);
    expect(capDeletion).toBeGreaterThan(disableBranch);
    expect(sql.slice(disableBranch, capDeletion)).toContain('SET pasalo_mode = false');
    expect(sql.slice(disableBranch, capDeletion)).toContain('RETURN v_batch');
  });
});
