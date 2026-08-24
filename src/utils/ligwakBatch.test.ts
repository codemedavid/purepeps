import { describe, it, expect } from 'vitest';
import { buildBatchLigwak, type LigwakSourceOrder } from './ligwakBatch';

const RETA = 'prod-reta';
const V10 = 'var-10mg';
const V5 = 'var-5mg';

function line(overrides: Partial<LigwakSourceOrder['order_items'][number]> = {}) {
  return {
    product_id: RETA,
    product_name: 'Retatrutide',
    variation_id: V10,
    variation_name: '10mg',
    quantity_mg: 10,
    quantity: 5,
    price: 1000,
    ...overrides,
  };
}

function order(
  id: string,
  createdAt: string,
  items: LigwakSourceOrder['order_items'],
  overrides: Partial<LigwakSourceOrder> = {},
): LigwakSourceOrder {
  const itemsTotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  return {
    id,
    order_number: id.toUpperCase(),
    created_at: createdAt,
    customer_name: `Customer ${id}`,
    customer_email: `${id}@example.com`,
    customer_phone: '09170000000',
    order_status: 'confirmed',
    payment_type: 'pay_now',
    payment_status: 'paid',
    payment_method_name: 'GCash',
    manually_confirmed_at: null,
    subtotal: itemsTotal,
    total_price: itemsTotal,
    shipping_fee: 500,
    paid_total: itemsTotal + 500,
    refunded_total: null,
    order_items: items,
    ...overrides,
  };
}

/** Kit size 10 for every stream unless a test says otherwise. */
const kitSizeOf = () => 10;

describe('buildBatchLigwak — discovering the streams in a batch', () => {
  it('allocates each product variation as its own independent queue', () => {
    const result = buildBatchLigwak(
      [
        order('a', '2026-08-01T09:00:00Z', [line({ quantity: 12 })]),
        order('b', '2026-08-02T09:00:00Z', [
          line({ variation_id: V5, variation_name: '5mg', quantity_mg: 5, quantity: 7 }),
        ]),
      ],
      kitSizeOf,
    );

    expect(result.allocations).toHaveLength(2);
    const tenMg = result.allocations.find((a) => a.variationId === V10);
    const fiveMg = result.allocations.find((a) => a.variationId === V5);

    expect(tenMg).toMatchObject({ completeKits: 1, ligwakVials: 2 });
    // 7 vials never reach a kit, so the whole 5mg queue is ligwak.
    expect(fiveMg).toMatchObject({ completeKits: 0, ligwakVials: 7 });
  });

  it('asks for the kit size of each stream rather than assuming one', () => {
    const seen: Array<{ productId: string; variationId: string | null }> = [];
    buildBatchLigwak(
      [order('a', '2026-08-01T09:00:00Z', [line({ quantity: 12 })])],
      (productId, variationId) => {
        seen.push({ productId, variationId });
        return 6;
      },
    );

    expect(seen).toEqual([{ productId: RETA, variationId: V10 }]);
  });

  it('honours a per-stream kit size', () => {
    const result = buildBatchLigwak(
      [order('a', '2026-08-01T09:00:00Z', [line({ quantity: 14 })])],
      () => 6,
    );

    expect(result.allocations[0]).toMatchObject({ completeKits: 2, ligwakVials: 2 });
  });

  it('produces nothing for a batch with no eligible orders', () => {
    const result = buildBatchLigwak(
      [order('x', '2026-08-01T09:00:00Z', [line()], { order_status: 'cancelled' })],
      kitSizeOf,
    );

    expect(result.allocations).toEqual([]);
    expect(result.records).toEqual([]);
  });
});

describe('buildBatchLigwak — the ligwak records', () => {
  it('creates a record only for the customers holding the incomplete kit', () => {
    const result = buildBatchLigwak(
      [
        order('a', '2026-08-01T09:00:00Z', [line({ quantity: 8 })]),
        order('b', '2026-08-02T09:00:00Z', [line({ quantity: 5 })]),
      ],
      kitSizeOf,
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      orderId: 'b',
      orderNumber: 'B',
      customerName: 'Customer b',
      customerEmail: 'b@example.com',
      customerPhone: '09170000000',
      productName: 'Retatrutide',
      variationName: '10mg',
      quantityMg: 10,
      totalQuantity: 5,
      confirmedQuantity: 2,
      ligwakQuantity: 3,
      paymentType: 'pay_now',
      paymentStatus: 'paid',
    });
  });

  it('prices the refund from the ligwak vials only', () => {
    const result = buildBatchLigwak(
      [
        order('a', '2026-08-01T09:00:00Z', [line({ quantity: 8 })]),
        order('b', '2026-08-02T09:00:00Z', [line({ quantity: 5 })]),
      ],
      kitSizeOf,
    );

    // 3 ligwak vials at 1000; the parcel still ships, so no shipping refund.
    expect(result.records[0].refundAmount).toBe(3000);
    expect(result.records[0].refundStatus).toBe('for_review');
  });

  it('records a reason naming the incomplete kit', () => {
    const result = buildBatchLigwak(
      [order('a', '2026-08-01T09:00:00Z', [line({ quantity: 7 })])],
      kitSizeOf,
    );

    expect(result.records[0].reason).toMatch(/incomplete kit/i);
  });
});

describe('buildBatchLigwak — an order is only entirely ligwak across ALL its lines', () => {
  it('refunds the prepaid shipping fee when nothing on the order ships', () => {
    const result = buildBatchLigwak(
      [order('solo', '2026-08-01T09:00:00Z', [line({ quantity: 7 })])],
      kitSizeOf,
    );

    // 7 vials x 1000 = 7000, plus the 500 fee, since no parcel goes out.
    expect(result.records[0].refundAmount).toBe(7500);
  });

  it('keeps the shipping fee when another line on the same order still ships', () => {
    // The 10mg line fills a kit; the 5mg line does not. The parcel still ships.
    const result = buildBatchLigwak(
      [
        order('mixed', '2026-08-01T09:00:00Z', [
          line({ quantity: 10 }),
          line({ variation_id: V5, variation_name: '5mg', quantity_mg: 5, quantity: 4 }),
        ]),
      ],
      kitSizeOf,
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ variationName: '5mg', ligwakQuantity: 4 });
    // 4 x 1000 only — the 500 shipping fee stays put.
    expect(result.records[0].refundAmount).toBe(4000);
  });

  it('treats an order as entirely ligwak only when every one of its lines is', () => {
    const result = buildBatchLigwak(
      [
        order('all', '2026-08-01T09:00:00Z', [
          line({ quantity: 3 }),
          line({ variation_id: V5, variation_name: '5mg', quantity_mg: 5, quantity: 4 }),
        ]),
      ],
      kitSizeOf,
    );

    // Neither stream reaches a kit, so both lines are ligwak and shipping returns.
    const total = result.records.reduce((s, r) => s + r.refundAmount, 0);
    expect(result.records).toHaveLength(2);
    expect(total).toBe(3 * 1000 + 4 * 1000 + 500);
  });
});

describe('buildBatchLigwak — totals for the admin preview', () => {
  it('summarises affected orders, vials and money owed', () => {
    const result = buildBatchLigwak(
      [
        order('a', '2026-08-01T09:00:00Z', [line({ quantity: 8 })]),
        order('b', '2026-08-02T09:00:00Z', [line({ quantity: 5 })]),
        order('c', '2026-08-03T09:00:00Z', [
          line({ variation_id: V5, variation_name: '5mg', quantity_mg: 5, quantity: 4 }),
        ]),
      ],
      kitSizeOf,
    );

    expect(result.totals).toMatchObject({
      affectedOrders: 2,
      ligwakVials: 7, // 3 from b, 4 from c
      refundOwed: 3000 + 4000 + 500, // c's whole order is ligwak, so its fee returns
    });
  });

  it('counts an order once even when two of its lines are ligwak', () => {
    const result = buildBatchLigwak(
      [
        order('all', '2026-08-01T09:00:00Z', [
          line({ quantity: 3 }),
          line({ variation_id: V5, variation_name: '5mg', quantity_mg: 5, quantity: 4 }),
        ]),
      ],
      kitSizeOf,
    );

    expect(result.records).toHaveLength(2);
    expect(result.totals.affectedOrders).toBe(1);
  });
});
