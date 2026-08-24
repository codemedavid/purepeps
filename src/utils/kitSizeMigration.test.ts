import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260827000000_product_kit_size.sql'),
  'utf8',
);

describe('product kit size migration', () => {
  it('adds vials_per_kit to products and to variations', () => {
    expect(sql).toContain('ALTER TABLE products');
    expect(sql).toContain('ALTER TABLE product_variations');
    expect(sql.match(/ADD COLUMN IF NOT EXISTS vials_per_kit/g)).toHaveLength(2);
  });

  // NULL is the "inherit" signal that resolveKitSize() keys on: a variation with
  // no kit size of its own must fall through to its product, and a product with
  // none must fall through to DEFAULT_VIALS_PER_KIT. A NOT NULL DEFAULT would
  // stamp every row with a concrete value and destroy that distinction.
  it('leaves the column nullable so an unset kit size means "inherit"', () => {
    expect(sql).not.toMatch(/vials_per_kit\s+INTEGER\s+NOT NULL/);
    expect(sql).not.toMatch(/vials_per_kit\s+INTEGER[^;]*DEFAULT/);
  });

  it('rejects a non-positive kit size in the database, not just the client', () => {
    expect(sql.match(/CHECK \(vials_per_kit\s*>=\s*1\)/g)).toHaveLength(2);
  });

  it('is idempotent so it can be re-run safely', () => {
    expect(sql.match(/ADD COLUMN IF NOT EXISTS/g)).toHaveLength(2);
  });
});
