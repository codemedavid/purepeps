import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Migration drift guard for the group-buy cap trigger.
 *
 * Production incident (batch "Gb 5"): AICAR carried per-variation caps of 20/20
 * with 15 + 12 units ordered (product total 27, product cap 40). Checkout was
 * rejected with
 *   "Group buy limit reached ... (cap 20, already reserved 27, you requested 1)."
 * — a VARIATION cap (20) compared against the whole PRODUCT total (27). Only the
 * pre-20260716 (variation-blind) definition of enforce_group_buy_on_order does
 * that: it loops over every cap row and sums all of the product's units against
 * it, ignoring group_buy_caps.variation_id.
 *
 * The repo shipped the correct, variation-aware definition; the DEPLOYED function
 * was an older one. That is possible because six migration files each define the
 * same function, and re-applying an older file silently reverts cap enforcement.
 * These tests encode the invariants that make that failure detectable:
 *   1. the newest definition is variation-aware;
 *   2. it carries a version marker, so the deployed body can be fingerprinted
 *      with pg_get_functiondef without guessing;
 *   3. every superseded (variation-blind) definition warns against re-applying.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const DEFINITION_MARKER = 'CREATE OR REPLACE FUNCTION public.enforce_group_buy_on_order()';

/** The marker string embedded in the function body for live fingerprinting. */
export const ENFORCEMENT_VERSION_MARKER = 'enforcement-version: variation-aware-v2';

/** Banner every superseded definition must carry so it is never re-applied. */
const SUPERSEDED_BANNER = 'SUPERSEDED';

interface MigrationDefinition {
  file: string;
  sql: string;
}

function readDefinitions(): MigrationDefinition[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }))
    .filter((entry) => entry.sql.includes(DEFINITION_MARKER));
}

/** The body of the enforce_group_buy_on_order definition inside one migration. */
function definitionBody(sql: string): string {
  const start = sql.indexOf(DEFINITION_MARKER);
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end === -1 ? undefined : end);
}

function isVariationAware(sql: string): boolean {
  return definitionBody(sql).includes('variation_id');
}

describe('group-buy cap enforcement migrations', () => {
  const definitions = readDefinitions();

  it('finds the migrations that define the cap trigger', () => {
    expect(definitions.length).toBeGreaterThan(0);
  });

  it('the newest definition enforces caps per variation, not per product', () => {
    const newest = definitions[definitions.length - 1];
    expect(isVariationAware(newest.sql), `${newest.file} ignores group_buy_caps.variation_id`).toBe(
      true,
    );
  });

  it('the newest definition carries a version marker for live fingerprinting', () => {
    const newest = definitions[definitions.length - 1];
    expect(
      newest.sql.includes(ENFORCEMENT_VERSION_MARKER),
      `${newest.file} is missing the "${ENFORCEMENT_VERSION_MARKER}" marker, so a stale ` +
        'deployed function cannot be detected with pg_get_functiondef',
    ).toBe(true);
  });

  it('every superseded variation-blind definition warns against re-applying it', () => {
    const stale = definitions.filter((entry) => !isVariationAware(entry.sql));
    const unbannered = stale
      .filter((entry) => !entry.sql.includes(SUPERSEDED_BANNER))
      .map((entry) => entry.file);
    expect(
      unbannered,
      'Re-applying these files reverts cap enforcement to product-level and rejects ' +
        'orders for variations that still have room.',
    ).toEqual([]);
  });
});
