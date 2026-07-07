import { describe, it, expect } from 'vitest';
import { groupBatchOrders, buildOrderSequenceContext } from './batchOrderGroups';
import type { BatchOrder } from '../types';

/** Build a minimal BatchOrder for the grouping tests. */
function makeOrder(overrides: Partial<BatchOrder> = {}): BatchOrder {
  return {
    id: overrides.id ?? 'id',
    order_number: null,
    customer_name: 'Customer',
    customer_email: 'buyer@example.com',
    customer_phone: '0900',
    contact_method: null,
    selected_sticker_id: null,
    selected_sticker_name: null,
    shipping_address: null,
    shipping_barangay: null,
    shipping_city: null,
    shipping_state: null,
    shipping_zip_code: null,
    shipping_country: null,
    shipping_location: null,
    order_items: [],
    subtotal: 0,
    total_price: 0,
    shipping_fee: 0,
    paid_total: null,
    payment_method_name: null,
    payment_proof_url: null,
    additional_payment_proof_url: null,
    payment_status: 'pending',
    order_status: 'new',
    admin_notes: null,
    notes: null,
    tracking_number: null,
    shipping_provider: null,
    shipping_note: null,
    group_buy_batch_id: 'batch-1',
    parent_order_id: null,
    is_claim: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('groupBatchOrders', () => {
  it('returns an empty array for no orders', () => {
    expect(groupBatchOrders([])).toEqual([]);
  });

  it('keeps a lone order as its own single-order group', () => {
    const order = makeOrder({ id: 'a', order_number: 'PP-0001', total_price: 3000 });

    const groups = groupBatchOrders([order]);

    expect(groups).toHaveLength(1);
    expect(groups[0].isMulti).toBe(false);
    expect(groups[0].reference).toBe('PP-0001');
    expect(groups[0].sequenced).toEqual([
      { order, sequence: 1, label: 'Order 1' },
    ]);
    expect(groups[0].addOns).toEqual([]);
    expect(groups[0].groupTotal).toBe(3000);
  });

  it('groups a repeat order under the root and numbers them by creation time', () => {
    const root = makeOrder({
      id: 'root',
      order_number: 'PP-0001',
      total_price: 3000,
      created_at: '2025-01-01T00:00:00Z',
    });
    const repeat = makeOrder({
      id: 'repeat',
      order_number: 'PP-0007',
      parent_order_id: 'root',
      total_price: 4000,
      created_at: '2025-01-02T00:00:00Z',
    });

    const groups = groupBatchOrders([repeat, root]);

    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.isMulti).toBe(true);
    expect(group.reference).toBe('PP-0001');
    expect(group.root.id).toBe('root');
    expect(group.sequenced.map((s) => [s.label, s.order.id])).toEqual([
      ['Order 1', 'root'],
      ['Order 2', 'repeat'],
    ]);
    expect(group.groupTotal).toBe(7000);
    expect(group.allOrders).toHaveLength(2);
  });

  it('excludes cancelled orders from the group total', () => {
    // The reference header total must reflect what the customer actually owes,
    // not inflate it with cancelled orders (which free their units back).
    const root = makeOrder({
      id: 'root',
      order_number: 'PP-0001',
      total_price: 2157.2,
      created_at: '2025-01-01T00:00:00Z',
    });
    const cancelled = makeOrder({
      id: 'cancelled',
      parent_order_id: 'root',
      total_price: 2791.2,
      order_status: 'cancelled',
      created_at: '2025-01-02T00:00:00Z',
    });
    const active = makeOrder({
      id: 'active',
      parent_order_id: 'root',
      total_price: 1700,
      created_at: '2025-01-03T00:00:00Z',
    });

    const [group] = groupBatchOrders([root, cancelled, active]);

    // 2157.2 + 1700 — the cancelled 2791.2 is left out.
    expect(group.groupTotal).toBeCloseTo(3857.2, 2);
    // The cancelled order is still part of the group (shown, just not billed).
    expect(group.allOrders).toHaveLength(3);
  });

  it('separates claim add-ons from the numbered sequence', () => {
    const root = makeOrder({ id: 'root', order_number: 'PP-0001' });
    const claim = makeOrder({
      id: 'claim',
      order_number: 'PP-0009',
      parent_order_id: 'root',
      is_claim: true,
      created_at: '2025-01-03T00:00:00Z',
    });

    const [group] = groupBatchOrders([root, claim]);

    expect(group.sequenced.map((s) => s.order.id)).toEqual(['root']);
    expect(group.addOns.map((o) => o.id)).toEqual(['claim']);
    expect(group.isMulti).toBe(true);
  });

  it('resolves a claim linked to a repeat order back to the ultimate root', () => {
    const root = makeOrder({ id: 'root', order_number: 'PP-0001' });
    const repeat = makeOrder({
      id: 'repeat',
      parent_order_id: 'root',
      created_at: '2025-01-02T00:00:00Z',
    });
    // Claim points at the repeat (a child), not the root directly.
    const claim = makeOrder({
      id: 'claim',
      parent_order_id: 'repeat',
      is_claim: true,
      created_at: '2025-01-03T00:00:00Z',
    });

    const groups = groupBatchOrders([root, repeat, claim]);

    expect(groups).toHaveLength(1);
    expect(groups[0].root.id).toBe('root');
    expect(groups[0].sequenced.map((s) => s.order.id)).toEqual(['root', 'repeat']);
    expect(groups[0].addOns.map((o) => o.id)).toEqual(['claim']);
  });

  it('keeps distinct customers in separate groups', () => {
    const a = makeOrder({ id: 'a', order_number: 'PP-0001' });
    const b = makeOrder({ id: 'b', order_number: 'PP-0002' });

    const groups = groupBatchOrders([a, b]);

    expect(groups).toHaveLength(2);
    expect(groups.every((g) => !g.isMulti)).toBe(true);
  });

  it('sorts groups by most recent activity first', () => {
    const older = makeOrder({ id: 'older', order_number: 'PP-0001', created_at: '2025-01-01T00:00:00Z' });
    const newer = makeOrder({ id: 'newer', order_number: 'PP-0002', created_at: '2025-01-05T00:00:00Z' });

    const groups = groupBatchOrders([older, newer]);

    expect(groups.map((g) => g.reference)).toEqual(['PP-0002', 'PP-0001']);
  });

  it('uses the latest order in a group to rank it against other groups', () => {
    const soloRecent = makeOrder({ id: 'solo', order_number: 'PP-0100', created_at: '2025-01-04T00:00:00Z' });
    const root = makeOrder({ id: 'root', order_number: 'PP-0001', created_at: '2025-01-01T00:00:00Z' });
    const repeat = makeOrder({
      id: 'repeat',
      parent_order_id: 'root',
      created_at: '2025-01-06T00:00:00Z',
    });

    const groups = groupBatchOrders([soloRecent, root, repeat]);

    // The repeat's later timestamp lifts the whole PP-0001 group above the solo order.
    expect(groups.map((g) => g.reference)).toEqual(['PP-0001', 'PP-0100']);
  });

  it('tolerates a broken parent link by treating the order as its own root', () => {
    const orphan = makeOrder({ id: 'orphan', order_number: 'PP-0001', parent_order_id: 'missing' });

    const groups = groupBatchOrders([orphan]);

    expect(groups).toHaveLength(1);
    expect(groups[0].root.id).toBe('orphan');
    expect(groups[0].isMulti).toBe(false);
  });

  it('falls back to an id-derived reference when the root has no order number', () => {
    const root = makeOrder({ id: 'abcdef1234', order_number: null });

    const [group] = groupBatchOrders([root]);

    expect(group.reference).toBe('ABCDEF12');
  });
});

describe('buildOrderSequenceContext', () => {
  it('reports position, total, and reference for a numbered order', () => {
    const root = makeOrder({ id: 'root', order_number: 'PP-0001' });
    const repeat = makeOrder({
      id: 'repeat',
      parent_order_id: 'root',
      created_at: '2025-01-02T00:00:00Z',
    });
    const [group] = groupBatchOrders([root, repeat]);

    const ctx = buildOrderSequenceContext(group, 'repeat');

    expect(ctx.reference).toBe('PP-0001');
    expect(ctx.label).toBe('Order 2');
    expect(ctx.position).toBe(2);
    expect(ctx.total).toBe(2);
    expect(ctx.siblings.map((s) => [s.label, s.isCurrent])).toEqual([
      ['Order 1', false],
      ['Order 2', true],
    ]);
  });

  it('labels a claim add-on outside the numbered sequence', () => {
    const root = makeOrder({ id: 'root', order_number: 'PP-0001' });
    const claim = makeOrder({
      id: 'claim',
      parent_order_id: 'root',
      is_claim: true,
      created_at: '2025-01-03T00:00:00Z',
    });
    const [group] = groupBatchOrders([root, claim]);

    const ctx = buildOrderSequenceContext(group, 'claim');

    expect(ctx.label).toBe('Add-on');
    expect(ctx.position).toBe(0);
    expect(ctx.total).toBe(1);
    expect(ctx.siblings.map((s) => s.id)).toEqual(['root', 'claim']);
  });
});
