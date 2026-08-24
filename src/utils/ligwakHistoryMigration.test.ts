import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260827000300_order_history_ligwak.sql'),
  'utf8',
);

function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}`);
  expect(start, `${name} should be defined`).toBeGreaterThan(-1);
  const end = sql.indexOf('$$;', start);
  expect(end, `${name} should be terminated`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('customer-facing ligwak in order history', () => {
  it('adds a ligwak column to the shared history row builder', () => {
    expect(sql).toContain('CREATE FUNCTION public.order_history_rows');
    expect(functionBody('order_history_rows')).toContain('ligwak');
  });

  it('reaches the customer through both history lookups', () => {
    expect(sql).toContain('CREATE FUNCTION public.get_order_history_by_email');
    expect(sql).toContain('CREATE FUNCTION public.get_order_history_by_number');
  });

  // These rows are the admin's working notes on a refund, not the customer's
  // business, and one customer must never see another's.
  it('never sends admin-only fields to the customer', () => {
    const body = functionBody('order_history_rows');
    for (const forbidden of ['admin_notes', 'customer_email', 'customer_phone', 'actor']) {
      expect(
        body.includes(`lr.${forbidden}`),
        `order_history_rows must not select lr.${forbidden}`,
      ).toBe(false);
    }
  });

  it('sends exactly the fields the customer notice needs', () => {
    const body = functionBody('order_history_rows');
    for (const field of [
      'product_name',
      'variation_name',
      'ligwak_quantity',
      'confirmed_quantity',
      'refund_amount',
      'refund_status',
      'refund_reference',
    ]) {
      expect(body).toContain(field);
    }
  });

  it('scopes the ligwak rows to the order being read', () => {
    expect(functionBody('order_history_rows')).toMatch(/ligwak_records[\s\S]{0,400}order_id/);
  });

  it('keeps every history function definer-run with a pinned search_path', () => {
    for (const name of [
      'order_history_rows',
      'get_order_history_by_email',
      'get_order_history_by_number',
    ]) {
      const body = functionBody(name);
      expect(body).toContain('SECURITY DEFINER');
      expect(body).toContain('SET search_path = public');
    }
  });

  it('drops each function before recreating it, so the signature can change', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.order_history_rows');
  });
});
