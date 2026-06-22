import { describe, it, expect } from 'vitest';
import {
  computeBatchKpis,
  summarizeItemRevenue,
  summarizeCapFill,
  summarizeResale,
  summarizeDemand,
  ordersNeedingAction,
  filterBatchOrders,
} from './groupBuyOverview';
import type { BatchOrder, GroupBuyProgressItem, OrderLineItem } from '../types';

// --- Fixtures -------------------------------------------------------------

function lineItem(overrides: Partial<OrderLineItem> = {}): OrderLineItem {
  return {
    product_id: 'p1',
    product_name: 'BPC-157 5mg',
    variation_id: null,
    variation_name: null,
    quantity: 1,
    price: 1000,
    total: 1000,
    ...overrides,
  };
}

let seq = 0;
function order(overrides: Partial<BatchOrder> = {}): BatchOrder {
  seq += 1;
  return {
    id: `o${seq}`,
    order_number: `PP-${1000 + seq}`,
    customer_name: 'Jane Dela Cruz',
    customer_email: 'jane@example.com',
    customer_phone: '09170000000',
    contact_method: null,
    shipping_address: null,
    shipping_barangay: null,
    shipping_city: null,
    shipping_state: null,
    shipping_zip_code: null,
    shipping_country: null,
    shipping_location: null,
    order_items: [lineItem()],
    subtotal: 1000,
    total_price: 1000,
    shipping_fee: 0,
    payment_method_name: 'GCash',
    payment_proof_url: null,
    payment_status: 'pending',
    order_status: 'new',
    admin_notes: null,
    notes: null,
    tracking_number: null,
    shipping_provider: null,
    shipping_note: null,
    group_buy_batch_id: 'b1',
    parent_order_id: null,
    is_claim: false,
    created_at: '2026-06-01T08:00:00Z',
    updated_at: '2026-06-01T08:00:00Z',
    ...overrides,
  };
}

function capItem(overrides: Partial<GroupBuyProgressItem> = {}): GroupBuyProgressItem {
  return {
    product_id: 'p1',
    product_name: 'BPC-157 5mg',
    total_quantity: 0,
    confirmed_quantity: 0,
    order_count: 0,
    cancelled_quantity: 0,
    cap_quantity: null,
    ...overrides,
  };
}

// --- computeBatchKpis -----------------------------------------------------

describe('computeBatchKpis', () => {
  it('returns all-zero KPIs for an empty batch', () => {
    const kpis = computeBatchKpis([]);
    expect(kpis).toEqual({
      totalOrders: 0,
      activeOrders: 0,
      cancelledOrders: 0,
      toConfirmCount: 0,
      paidOrders: 0,
      claimOrders: 0,
      grossRevenue: 0,
      paidRevenue: 0,
      totalUnits: 0,
    });
  });

  it('counts active orders excluding cancelled, and totals cancelled separately', () => {
    const orders = [
      order({ order_status: 'confirmed' }),
      order({ order_status: 'new' }),
      order({ order_status: 'cancelled' }),
    ];
    const kpis = computeBatchKpis(orders);
    expect(kpis.totalOrders).toBe(3);
    expect(kpis.activeOrders).toBe(2);
    expect(kpis.cancelledOrders).toBe(1);
  });

  it('counts orders awaiting confirmation (status new)', () => {
    const orders = [
      order({ order_status: 'new' }),
      order({ order_status: 'new' }),
      order({ order_status: 'confirmed' }),
    ];
    expect(computeBatchKpis(orders).toConfirmCount).toBe(2);
  });

  it('counts paid orders by payment_status, ignoring cancelled ones', () => {
    const orders = [
      order({ payment_status: 'paid', order_status: 'confirmed' }),
      order({ payment_status: 'paid', order_status: 'cancelled' }), // cancelled excluded
      order({ payment_status: 'pending' }),
    ];
    expect(computeBatchKpis(orders).paidOrders).toBe(1);
  });

  it('sums gross revenue from non-cancelled orders and paid revenue from paid ones', () => {
    const orders = [
      order({ total_price: 1500, payment_status: 'paid', order_status: 'confirmed' }),
      order({ total_price: 500, payment_status: 'pending', order_status: 'new' }),
      order({ total_price: 9999, order_status: 'cancelled' }), // excluded from both
    ];
    const kpis = computeBatchKpis(orders);
    expect(kpis.grossRevenue).toBe(2000);
    expect(kpis.paidRevenue).toBe(1500);
  });

  it('treats a null total_price as zero revenue', () => {
    const orders = [order({ total_price: null, payment_status: 'paid', order_status: 'confirmed' })];
    expect(computeBatchKpis(orders).paidRevenue).toBe(0);
  });

  it('sums total units across non-cancelled orders only', () => {
    const orders = [
      order({ order_items: [lineItem({ quantity: 2 }), lineItem({ quantity: 3 })] }),
      order({ order_status: 'cancelled', order_items: [lineItem({ quantity: 10 })] }),
    ];
    expect(computeBatchKpis(orders).totalUnits).toBe(5);
  });

  it('counts claim add-on orders excluding cancelled', () => {
    const orders = [
      order({ is_claim: true }),
      order({ is_claim: true, order_status: 'cancelled' }),
      order({ is_claim: false }),
    ];
    expect(computeBatchKpis(orders).claimOrders).toBe(1);
  });
});

// --- summarizeItemRevenue -------------------------------------------------

describe('summarizeItemRevenue', () => {
  it('returns an empty summary for no orders', () => {
    expect(summarizeItemRevenue([])).toEqual({
      rows: [],
      totalUnitsOrdered: 0,
      totalUnitsConfirmed: 0,
      totalUnitsPending: 0,
      totalGrossRevenue: 0,
      totalCollectedRevenue: 0,
    });
  });

  it('groups units and revenue per product across orders', () => {
    const rows = summarizeItemRevenue([
      order({
        order_status: 'confirmed',
        payment_status: 'paid',
        order_items: [lineItem({ product_id: 'p1', quantity: 2, total: 2000 })],
      }),
      order({
        order_status: 'new',
        payment_status: 'pending',
        order_items: [lineItem({ product_id: 'p1', quantity: 1, total: 1000 })],
      }),
    ]).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      product_id: 'p1',
      orderCount: 2,
      unitsOrdered: 3,
      unitsConfirmed: 2,
      unitsPending: 1,
      grossRevenue: 3000,
      collectedRevenue: 2000,
    });
  });

  it('excludes cancelled orders entirely', () => {
    const summary = summarizeItemRevenue([
      order({ order_status: 'cancelled', payment_status: 'paid', order_items: [lineItem({ quantity: 5, total: 5000 })] }),
    ]);
    expect(summary.rows).toEqual([]);
    expect(summary.totalGrossRevenue).toBe(0);
  });

  it('counts confirmed vs pending units by order status', () => {
    const summary = summarizeItemRevenue([
      order({ order_status: 'delivered', order_items: [lineItem({ product_id: 'p1', quantity: 4, total: 4000 })] }),
      order({ order_status: 'new', order_items: [lineItem({ product_id: 'p1', quantity: 3, total: 3000 })] }),
    ]);
    expect(summary.rows[0].unitsConfirmed).toBe(4);
    expect(summary.rows[0].unitsPending).toBe(3);
  });

  it('only counts paid orders toward collected revenue', () => {
    const summary = summarizeItemRevenue([
      order({ payment_status: 'paid', order_status: 'confirmed', order_items: [lineItem({ total: 1500 })] }),
      order({ payment_status: 'pending', order_status: 'new', order_items: [lineItem({ total: 500 })] }),
    ]);
    expect(summary.totalGrossRevenue).toBe(2000);
    expect(summary.totalCollectedRevenue).toBe(1500);
  });

  it('falls back to price × quantity when a line total is missing', () => {
    const summary = summarizeItemRevenue([
      order({ order_items: [lineItem({ quantity: 3, price: 250, total: null as unknown as number })] }),
    ]);
    expect(summary.rows[0].grossRevenue).toBe(750);
  });

  it('counts an order once per product even if the product has multiple lines', () => {
    const summary = summarizeItemRevenue([
      order({
        order_items: [
          lineItem({ product_id: 'p1', variation_id: 'v1', quantity: 1, total: 1000 }),
          lineItem({ product_id: 'p1', variation_id: 'v2', quantity: 2, total: 2000 }),
        ],
      }),
    ]);
    expect(summary.rows[0].orderCount).toBe(1);
    expect(summary.rows[0].unitsOrdered).toBe(3);
    expect(summary.rows[0].grossRevenue).toBe(3000);
  });

  it('sorts product rows by name', () => {
    const summary = summarizeItemRevenue([
      order({ order_items: [lineItem({ product_id: 'p2', product_name: 'Zinc' })] }),
      order({ order_items: [lineItem({ product_id: 'p1', product_name: 'Acet' })] }),
    ]);
    expect(summary.rows.map((r) => r.product_name)).toEqual(['Acet', 'Zinc']);
  });
});

// --- summarizeCapFill -----------------------------------------------------

describe('summarizeCapFill', () => {
  it('returns zeroed summary when no product is capped', () => {
    const summary = summarizeCapFill([capItem(), capItem({ product_id: 'p2' })]);
    expect(summary).toEqual({
      cappedProducts: 0,
      totalCap: 0,
      totalReserved: 0,
      fillPct: 0,
      fullProducts: 0,
    });
  });

  it('aggregates caps and reserved units across capped products', () => {
    const summary = summarizeCapFill([
      capItem({ product_id: 'p1', cap_quantity: 50, total_quantity: 45 }),
      capItem({ product_id: 'p2', cap_quantity: 30, total_quantity: 15 }),
      capItem({ product_id: 'p3', cap_quantity: null, total_quantity: 99 }), // uncapped ignored
    ]);
    expect(summary.cappedProducts).toBe(2);
    expect(summary.totalCap).toBe(80);
    expect(summary.totalReserved).toBe(60);
    expect(summary.fillPct).toBe(75); // 60/80
  });

  it('counts products that have reached their cap as full', () => {
    const summary = summarizeCapFill([
      capItem({ product_id: 'p1', cap_quantity: 10, total_quantity: 10 }),
      capItem({ product_id: 'p2', cap_quantity: 10, total_quantity: 4 }),
    ]);
    expect(summary.fullProducts).toBe(1);
  });

  it('clamps fill percentage to 100 even if reserved somehow exceeds cap', () => {
    const summary = summarizeCapFill([
      capItem({ product_id: 'p1', cap_quantity: 10, total_quantity: 14 }),
    ]);
    expect(summary.fillPct).toBe(100);
  });
});

// --- summarizeResale ------------------------------------------------------

describe('summarizeResale', () => {
  it('ignores uncapped products (nothing to resell against)', () => {
    const summary = summarizeResale([capItem({ cap_quantity: null, total_quantity: 40 })]);
    expect(summary.itemsToResell).toEqual([]);
    expect(summary.totalResellable).toBe(0);
    expect(summary.totalFreed).toBe(0);
  });

  it('omits capped products that are still full', () => {
    const summary = summarizeResale([capItem({ cap_quantity: 20, total_quantity: 20 })]);
    expect(summary.itemsToResell).toEqual([]);
  });

  it('reports resellable units with freed as an included subset, not additive', () => {
    // 20 cap, 17 active after 3 cancelled → 3 resellable, all of which are freed.
    const summary = summarizeResale([
      capItem({ product_id: 'p1', cap_quantity: 20, total_quantity: 17, cancelled_quantity: 3 }),
    ]);
    expect(summary.itemsToResell).toEqual([
      { product_id: 'p1', product_name: 'BPC-157 5mg', resellable: 3, freed: 3 },
    ]);
    expect(summary.totalResellable).toBe(3);
    expect(summary.totalFreed).toBe(3);
  });

  it('caps the freed subset at the resellable amount', () => {
    // Never-filled headroom (cap 20, only 5 ordered then all cancelled): 15 resellable,
    // but freed is clamped to the 15 actually available, not the raw cancelled count.
    const summary = summarizeResale([
      capItem({ product_id: 'p1', cap_quantity: 20, total_quantity: 5, cancelled_quantity: 99 }),
    ]);
    expect(summary.itemsToResell[0].resellable).toBe(15);
    expect(summary.itemsToResell[0].freed).toBe(15);
  });

  it('aggregates across multiple capped products', () => {
    const summary = summarizeResale([
      capItem({ product_id: 'p1', cap_quantity: 20, total_quantity: 18, cancelled_quantity: 2 }),
      capItem({ product_id: 'p2', cap_quantity: 10, total_quantity: 9, cancelled_quantity: 0 }),
      capItem({ product_id: 'p3', cap_quantity: 5, total_quantity: 5, cancelled_quantity: 0 }), // full
    ]);
    expect(summary.itemsToResell).toHaveLength(2);
    expect(summary.totalResellable).toBe(3); // 2 + 1
    expect(summary.totalFreed).toBe(2);
  });
});

// --- summarizeDemand ------------------------------------------------------

describe('summarizeDemand', () => {
  it('includes only products with demand or a cap, sorted by name', () => {
    const summary = summarizeDemand(
      [
        capItem({ product_id: 'p1', product_name: 'Zinc', total_quantity: 4, cap_quantity: null }),
        capItem({ product_id: 'p2', product_name: 'Acet', total_quantity: 0, cap_quantity: 10 }),
        capItem({ product_id: 'p3', product_name: 'Idle', total_quantity: 0, cap_quantity: null }),
      ],
      'open',
    );
    expect(summary.rows.map((r) => r.product_name)).toEqual(['Acet', 'Zinc']);
  });

  it('rolls up totals and uses the open-phase "Left" headline', () => {
    const summary = summarizeDemand(
      [
        capItem({ product_id: 'p1', total_quantity: 18, confirmed_quantity: 12, cap_quantity: 20 }),
        capItem({ product_id: 'p2', total_quantity: 5, confirmed_quantity: 5, cap_quantity: 10 }),
      ],
      'open',
    );
    expect(summary.highlightLabel).toBe('Left');
    expect(summary.totalOrdered).toBe(23);
    expect(summary.totalConfirmed).toBe(17);
    expect(summary.totalPending).toBe(6);
    expect(summary.totalHighlight).toBe(7); // (20-18) + (10-5)
  });

  it('excludes uncapped products from the headline total', () => {
    const summary = summarizeDemand(
      [capItem({ product_id: 'p1', total_quantity: 9, cap_quantity: null })],
      'open',
    );
    expect(summary.totalHighlight).toBe(0);
    expect(summary.rows[0].highlight).toBeNull();
  });
});

// --- ordersNeedingAction --------------------------------------------------

describe('ordersNeedingAction', () => {
  it('returns only new orders, oldest first', () => {
    const orders = [
      order({ id: 'a', order_status: 'new', created_at: '2026-06-03T00:00:00Z' }),
      order({ id: 'b', order_status: 'confirmed', created_at: '2026-06-02T00:00:00Z' }),
      order({ id: 'c', order_status: 'new', created_at: '2026-06-01T00:00:00Z' }),
    ];
    const result = ordersNeedingAction(orders);
    expect(result.map((o) => o.id)).toEqual(['c', 'a']);
  });

  it('returns an empty array when nothing needs action', () => {
    expect(ordersNeedingAction([order({ order_status: 'delivered' })])).toEqual([]);
  });
});

// --- filterBatchOrders ----------------------------------------------------

describe('filterBatchOrders', () => {
  const orders = [
    order({ id: 'a', customer_name: 'Maria Santos', order_number: 'PP-2001', order_status: 'new' }),
    order({
      id: 'b',
      customer_name: 'Jose Rizal',
      order_number: 'PP-2002',
      customer_email: 'jose@bayani.ph',
      order_status: 'confirmed',
    }),
    order({
      id: 'c',
      customer_name: 'Andres B.',
      order_number: 'PP-2003',
      customer_phone: '09995551234',
      order_status: 'confirmed',
      order_items: [lineItem({ product_name: 'TB-500 10mg' })],
    }),
  ];

  it('returns every order when query is blank and status is all', () => {
    expect(filterBatchOrders(orders, { query: '', status: 'all' })).toHaveLength(3);
  });

  it('filters by order status', () => {
    const result = filterBatchOrders(orders, { query: '', status: 'confirmed' });
    expect(result.map((o) => o.id)).toEqual(['b', 'c']);
  });

  it('matches customer name case-insensitively', () => {
    const result = filterBatchOrders(orders, { query: 'maria', status: 'all' });
    expect(result.map((o) => o.id)).toEqual(['a']);
  });

  it('matches the order number', () => {
    const result = filterBatchOrders(orders, { query: 'PP-2002', status: 'all' });
    expect(result.map((o) => o.id)).toEqual(['b']);
  });

  it('matches email and phone', () => {
    expect(filterBatchOrders(orders, { query: 'bayani', status: 'all' }).map((o) => o.id)).toEqual([
      'b',
    ]);
    expect(filterBatchOrders(orders, { query: '5551234', status: 'all' }).map((o) => o.id)).toEqual([
      'c',
    ]);
  });

  it('matches an item product name inside the order', () => {
    const result = filterBatchOrders(orders, { query: 'tb-500', status: 'all' });
    expect(result.map((o) => o.id)).toEqual(['c']);
  });

  it('combines a text query with a status filter', () => {
    const result = filterBatchOrders(orders, { query: 'PP-200', status: 'confirmed' });
    expect(result.map((o) => o.id)).toEqual(['b', 'c']);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterBatchOrders(orders, { query: '  maria  ', status: 'all' }).map((o) => o.id)).toEqual([
      'a',
    ]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterBatchOrders(orders, { query: 'zzzz', status: 'all' })).toEqual([]);
  });
});
