import { describe, it, expect } from 'vitest';
import { allocateKits, type AllocatableOrder } from './ligwak';

const PRODUCT = 'prod-reta';
const VARIATION = 'var-10mg';

/** A paid Pay Now order for `qty` vials of the stream under test. */
function order(
  id: string,
  createdAt: string,
  qty: number,
  overrides: Partial<AllocatableOrder> = {},
): AllocatableOrder {
  return {
    id,
    order_number: id.toUpperCase(),
    created_at: createdAt,
    order_status: 'confirmed',
    payment_type: 'pay_now',
    payment_status: 'paid',
    manually_confirmed_at: null,
    order_items: [
      { product_id: PRODUCT, variation_id: VARIATION, quantity: qty },
    ],
    ...overrides,
  };
}

const STREAM = { productId: PRODUCT, variationId: VARIATION, kitSize: 10 };

describe('allocateKits — the worked examples from the brief', () => {
  it('splits 15 vials into one complete kit and 5 ligwak vials', () => {
    const result = allocateKits(
      [order('a', '2026-08-01T09:00:00Z', 10), order('b', '2026-08-02T09:00:00Z', 5)],
      STREAM,
    );

    expect(result.totalConfirmedVials).toBe(15);
    expect(result.completeKits).toBe(1);
    expect(result.ligwakVials).toBe(5);
  });

  it('splits ONE order per vial rather than cancelling all of it', () => {
    // Customer A orders 8, Customer B orders 5, kit size 10.
    // A's 8 plus B's first 2 complete the kit; B's remaining 3 are ligwak.
    const result = allocateKits(
      [order('a', '2026-08-01T09:00:00Z', 8), order('b', '2026-08-02T09:00:00Z', 5)],
      STREAM,
    );

    expect(result.completeKits).toBe(1);
    expect(result.ligwakVials).toBe(3);

    const [a, b] = result.entries;
    expect(a).toMatchObject({ orderId: 'a', quantity: 8, confirmedQty: 8, ligwakQty: 0 });
    expect(b).toMatchObject({ orderId: 'b', quantity: 5, confirmedQty: 2, ligwakQty: 3 });
  });
});

describe('allocateKits — kit boundaries', () => {
  it('leaves nothing ligwak when the total is an exact multiple of the kit size', () => {
    const result = allocateKits(
      [order('a', '2026-08-01T09:00:00Z', 12), order('b', '2026-08-02T09:00:00Z', 8)],
      STREAM,
    );

    expect(result.completeKits).toBe(2);
    expect(result.ligwakVials).toBe(0);
    expect(result.entries.every((e) => e.ligwakQty === 0)).toBe(true);
  });

  // Nobody's vials are in a complete kit, so everybody is ligwak. This is the
  // group buy that simply did not reach one kit.
  it('marks every vial ligwak when the total never reaches a single kit', () => {
    const result = allocateKits([order('a', '2026-08-01T09:00:00Z', 7)], STREAM);

    expect(result.completeKits).toBe(0);
    expect(result.ligwakVials).toBe(7);
    expect(result.entries[0]).toMatchObject({ confirmedQty: 0, ligwakQty: 7 });
  });

  it('reports which kit each order s vials landed in', () => {
    const result = allocateKits(
      [
        order('a', '2026-08-01T09:00:00Z', 10),
        order('b', '2026-08-02T09:00:00Z', 4),
        order('c', '2026-08-03T09:00:00Z', 9),
      ],
      STREAM,
    );

    // a fills kit 1; b opens kit 2; c spans kits 2 and 3.
    expect(result.entries[0]).toMatchObject({ firstKitIndex: 1, lastKitIndex: 1 });
    expect(result.entries[1]).toMatchObject({ firstKitIndex: 2, lastKitIndex: 2 });
    expect(result.entries[2]).toMatchObject({ firstKitIndex: 2, lastKitIndex: 3 });
  });

  it('returns an empty allocation when no order matches the stream', () => {
    const result = allocateKits([], STREAM);

    expect(result).toMatchObject({
      totalConfirmedVials: 0,
      completeKits: 0,
      ligwakVials: 0,
      entries: [],
    });
  });
});

describe('allocateKits — allocation follows the exact order placement time', () => {
  it('fills kits oldest first regardless of the order the input arrives in', () => {
    const newest = order('newest', '2026-08-09T09:00:00Z', 5);
    const oldest = order('oldest', '2026-08-01T09:00:00Z', 10);

    const result = allocateKits([newest, oldest], STREAM);

    expect(result.entries.map((e) => e.orderId)).toEqual(['oldest', 'newest']);
    // The LATEST order carries the incomplete kit, never the earliest.
    expect(result.entries[0].ligwakQty).toBe(0);
    expect(result.entries[1].ligwakQty).toBe(5);
  });

  it('breaks an identical timestamp deterministically, whatever the input order', () => {
    const sameInstant = '2026-08-01T09:00:00Z';
    const forwards = allocateKits(
      [order('a', sameInstant, 8), order('b', sameInstant, 5)],
      STREAM,
    );
    const backwards = allocateKits(
      [order('b', sameInstant, 5), order('a', sameInstant, 8)],
      STREAM,
    );

    // Two runs over the same data must never disagree about who is ligwak.
    expect(forwards.entries.map((e) => e.orderId)).toEqual(['a', 'b']);
    expect(backwards.entries.map((e) => e.orderId)).toEqual(['a', 'b']);
    expect(backwards.entries[1].ligwakQty).toBe(3);
  });

  it('does not mutate the orders it was given', () => {
    const orders = [order('b', '2026-08-02T09:00:00Z', 5), order('a', '2026-08-01T09:00:00Z', 8)];
    const snapshot = JSON.parse(JSON.stringify(orders));

    allocateKits(orders, STREAM);

    expect(orders).toEqual(snapshot);
  });
});

describe('allocateKits — only eligible confirmed orders fill a kit', () => {
  it('excludes cancelled orders', () => {
    const result = allocateKits(
      [
        order('a', '2026-08-01T09:00:00Z', 10),
        order('cancelled', '2026-08-02T09:00:00Z', 5, { order_status: 'cancelled' }),
      ],
      STREAM,
    );

    expect(result.totalConfirmedVials).toBe(10);
    expect(result.entries.map((e) => e.orderId)).toEqual(['a']);
  });

  it('excludes orders still awaiting admin confirmation', () => {
    const result = allocateKits(
      [order('new', '2026-08-01T09:00:00Z', 5, { order_status: 'new' })],
      STREAM,
    );

    expect(result.totalConfirmedVials).toBe(0);
  });

  it('excludes an unpaid Pay Now order', () => {
    const result = allocateKits(
      [order('unpaid', '2026-08-01T09:00:00Z', 5, { payment_status: 'pending' })],
      STREAM,
    );

    expect(result.totalConfirmedVials).toBe(0);
  });

  it('excludes a failed or refunded payment', () => {
    const result = allocateKits(
      [
        order('failed', '2026-08-01T09:00:00Z', 5, { payment_status: 'failed' }),
        order('refunded', '2026-08-02T09:00:00Z', 5, { payment_status: 'refunded' }),
      ],
      STREAM,
    );

    expect(result.totalConfirmedVials).toBe(0);
  });

  // COD is unpaid by design until the courier collects the shipping fee, so it
  // is real demand and must hold its place in the queue.
  it('counts an unpaid COD order', () => {
    const result = allocateKits(
      [
        order('cod', '2026-08-01T09:00:00Z', 5, {
          payment_type: 'cod',
          payment_status: 'pending',
        }),
      ],
      STREAM,
    );

    expect(result.totalConfirmedVials).toBe(5);
  });

  it('counts an unpaid Pay Now order an admin took responsibility for', () => {
    const result = allocateKits(
      [
        order('vouched', '2026-08-01T09:00:00Z', 5, {
          payment_status: 'pending',
          manually_confirmed_at: '2026-08-03T00:00:00Z',
        }),
      ],
      STREAM,
    );

    expect(result.totalConfirmedVials).toBe(5);
  });
});

describe('allocateKits — the stream is one product AND one variation', () => {
  it('ignores a different variation of the same product', () => {
    const result = allocateKits(
      [
        order('a', '2026-08-01T09:00:00Z', 8),
        order('other', '2026-08-02T09:00:00Z', 5, {
          order_items: [{ product_id: PRODUCT, variation_id: 'var-5mg', quantity: 5 }],
        }),
      ],
      STREAM,
    );

    // A 5mg vial cannot fill a 10mg kit, so the 10mg stream is still short.
    expect(result.totalConfirmedVials).toBe(8);
    expect(result.ligwakVials).toBe(8);
  });

  it('ignores a different product entirely', () => {
    const result = allocateKits(
      [
        order('a', '2026-08-01T09:00:00Z', 10),
        order('other', '2026-08-02T09:00:00Z', 5, {
          order_items: [{ product_id: 'prod-bpc', variation_id: VARIATION, quantity: 5 }],
        }),
      ],
      STREAM,
    );

    expect(result.totalConfirmedVials).toBe(10);
  });

  it('allocates a product that has no variations at all', () => {
    const result = allocateKits(
      [
        order('a', '2026-08-01T09:00:00Z', 12, {
          order_items: [{ product_id: PRODUCT, variation_id: null, quantity: 12 }],
        }),
      ],
      { productId: PRODUCT, variationId: null, kitSize: 10 },
    );

    expect(result.completeKits).toBe(1);
    expect(result.ligwakVials).toBe(2);
  });

  it('sums repeated lines of the same stream within one order', () => {
    const result = allocateKits(
      [
        order('split', '2026-08-01T09:00:00Z', 0, {
          order_items: [
            { product_id: PRODUCT, variation_id: VARIATION, quantity: 4 },
            { product_id: PRODUCT, variation_id: VARIATION, quantity: 3 },
          ],
        }),
      ],
      STREAM,
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].quantity).toBe(7);
  });
});
