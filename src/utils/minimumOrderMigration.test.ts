import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260828000000_universal_minimum_order.sql'),
  'utf8',
);

describe('universal minimum order migration', () => {
  it('adds the per-product override columns', () => {
    expect(sql).toContain('ALTER TABLE products');
    for (const column of [
      'use_universal_minimum',
      'minimum_order_unit',
      'minimum_order_enabled',
      'minimum_order_message',
      'enforce_minimum_per_variation',
    ]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
  });

  it('has every product follow the universal setting until told otherwise', () => {
    // The whole point of the universal default is that one change reaches every
    // product. Defaulting to FALSE would leave each one islanded on its own
    // value and make the universal control do nothing on existing rows.
    expect(sql).toMatch(/use_universal_minimum\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+TRUE/i);
  });

  it('leaves minimum-order enforcement ON per product', () => {
    // Off by default would silently disable the minimums an admin then sets
    // universally, and the cause would be invisible from the universal panel.
    expect(sql).toMatch(/minimum_order_enabled\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+TRUE/i);
  });

  it('combines variations by default, matching the client’s example', () => {
    expect(sql).toMatch(/enforce_minimum_per_variation\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+FALSE/i);
  });

  it('constrains the unit to the four the admin UI offers', () => {
    expect(sql).toMatch(
      /CHECK[\s\S]{0,120}'vial'[\s\S]{0,60}'piece'[\s\S]{0,60}'box'[\s\S]{0,60}'kit'/,
    );
  });

  it('seeds the universal setting OFF', () => {
    // Applying this migration must not start rejecting carts that were valid a
    // moment earlier. An admin turns it on deliberately.
    expect(sql).toContain('universal_minimum_order_enabled');
    expect(sql).toMatch(/'universal_minimum_order_enabled',\s*\n?\s*'false'/);
  });

  it('seeds the quantity and unit alongside it', () => {
    expect(sql).toContain('universal_minimum_order_quantity');
    expect(sql).toContain('universal_minimum_order_unit');
  });

  it('never clobbers a choice an admin has already made', () => {
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
  });

  it('is idempotent and drops nothing', () => {
    expect(sql.match(/ADD COLUMN IF NOT EXISTS/g)).toHaveLength(5);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
  });

  it('leaves the pre-existing minimum_order_quantity column alone', () => {
    // 20260713000000 already added it, with real values on live rows. Re-adding
    // or re-defaulting it here would overwrite minimums already in use.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS minimum_order_quantity/);
  });
});
