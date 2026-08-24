import { describe, it, expect } from 'vitest';
import { buildLigwakCsv, type LigwakExportRow } from './ligwakExport';

function row(overrides: Partial<LigwakExportRow> = {}): LigwakExportRow {
  return {
    customer_name: 'Juan Dela Cruz',
    customer_email: 'juan@example.com',
    customer_phone: '09170000000',
    order_number: 'PP-1042',
    batch_label: 'Batch 7 — August',
    product_name: 'Retatrutide',
    variation_name: '10mg',
    quantity_mg: 10,
    total_quantity: 5,
    confirmed_quantity: 2,
    ligwak_quantity: 3,
    refund_amount: 3000,
    payment_type: 'pay_now',
    payment_status: 'paid',
    refund_status: 'for_review',
    ordered_at: '2026-08-02T09:00:00Z',
    reason: 'Included in the final incomplete kit when the group buy closed (10 vials per kit).',
    admin_notes: null,
    refund_reference: null,
    ...overrides,
  };
}

describe('buildLigwakCsv', () => {
  it('emits every column the Ligwak Management page shows', () => {
    const [header] = buildLigwakCsv([row()]).split('\n');

    expect(header).toBe(
      [
        'Customer',
        'Email',
        'Phone',
        'Order #',
        'Group Buy',
        'Product',
        'Variation',
        'Dosage (mg)',
        'Total qty',
        'Confirmed qty',
        'Ligwak qty',
        'Refund amount',
        'Payment method',
        'Payment status',
        'Refund status',
        'Order date',
        'Reason',
        'Refund reference',
        'Admin notes',
      ].join(','),
    );
  });

  it('writes the human labels, not the stored tokens', () => {
    const lines = buildLigwakCsv([row()]).split('\n');

    expect(lines[1]).toContain('Pay Now');
    expect(lines[1]).toContain('Paid');
    expect(lines[1]).toContain('For Review');
  });

  it('formats money to two decimals with no currency symbol', () => {
    const lines = buildLigwakCsv([row({ refund_amount: 2700.5 })]).split('\n');

    expect(lines[1]).toContain('2700.50');
    expect(lines[1]).not.toContain('₱');
  });

  it('quotes a value containing a comma so columns cannot shift', () => {
    const lines = buildLigwakCsv([row({ customer_name: 'Cruz, Juan' })]).split('\n');

    expect(lines[1]).toContain('"Cruz, Juan"');
  });

  it('renders a totals row so the money owed is legible at a glance', () => {
    const lines = buildLigwakCsv([
      row({ refund_amount: 3000, ligwak_quantity: 3 }),
      row({ refund_amount: 4000, ligwak_quantity: 4 }),
    ]).split('\n');

    const totals = lines[lines.length - 1];
    expect(totals).toContain('TOTAL');
    expect(totals).toContain('7'); // 3 + 4 ligwak vials
    expect(totals).toContain('7000.00');
  });

  it('emits a header even with nothing to export', () => {
    const lines = buildLigwakCsv([]).split('\n');

    expect(lines[0]).toContain('Customer');
    expect(lines).toHaveLength(1);
  });

  it('leaves empty optional fields blank rather than printing null', () => {
    const lines = buildLigwakCsv([row({ admin_notes: null, refund_reference: null })]).split('\n');

    expect(lines[1]).not.toContain('null');
  });
});
