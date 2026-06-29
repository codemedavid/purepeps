import { describe, it, expect } from 'vitest';
import {
  TRACKING_STEPS,
  FULFILLMENT_STAGES,
  ORDER_STATUS_OPTIONS,
  computeTrackingStep,
  fulfillmentStageLabel,
  orderStatusLabel,
  sequenceBundleOrders,
} from './orderTracking';
import type { OrderBundleRow } from '../types';

/** Build a minimal OrderBundleRow for the sequencing tests. */
function makeRow(overrides: Partial<OrderBundleRow> = {}): OrderBundleRow {
  return {
    id: overrides.id ?? 'id',
    order_number: 'TBS-1',
    order_status: 'new',
    payment_status: 'pending',
    payment_method_name: null,
    tracking_number: null,
    shipping_provider: null,
    shipping_note: null,
    total_price: 0,
    shipping_fee: 0,
    order_items: [],
    created_at: '2025-01-01T00:00:00Z',
    promo_code: null,
    discount_applied: null,
    fulfillment_stage: null,
    is_claim: false,
    parent_order_id: null,
    group_buy_batch_id: 'batch-1',
    batch_status: 'open',
    ...overrides,
  };
}

describe('TRACKING_STEPS', () => {
  it('defines the full nine-stage timeline in order', () => {
    expect(TRACKING_STEPS.map((s) => s.label)).toEqual([
      'Placed',
      'Confirmed',
      'Supplier preparing',
      'In logistics',
      'On the way to PH',
      'Arrived in PH',
      'Packing',
      'Out for delivery',
      'Delivered',
    ]);
  });

  it('gives every step a non-empty customer-facing message', () => {
    for (const step of TRACKING_STEPS) {
      expect(step.message.length).toBeGreaterThan(0);
    }
  });
});

describe('computeTrackingStep — local leg (order_status)', () => {
  it('maps a brand-new order to Placed', () => {
    const state = computeTrackingStep('new', null);
    expect(state.step).toBe(0);
    expect(state.isCancelled).toBe(false);
    expect(state.current?.key).toBe('placed');
  });

  it('maps confirmed to Confirmed', () => {
    expect(computeTrackingStep('confirmed', null).step).toBe(1);
  });

  it('maps the local-leg statuses to their steps', () => {
    expect(computeTrackingStep('packing', null).step).toBe(6);
    expect(computeTrackingStep('out_for_delivery', null).step).toBe(7);
    expect(computeTrackingStep('delivered', null).step).toBe(8);
  });

  it('defaults unknown or missing statuses to Placed', () => {
    expect(computeTrackingStep('wat', null).step).toBe(0);
    expect(computeTrackingStep(null, null).step).toBe(0);
    expect(computeTrackingStep(undefined, undefined).step).toBe(0);
  });

  it('maps legacy processing/shipped to the closest local-leg steps', () => {
    expect(computeTrackingStep('processing', null).step).toBe(6);
    expect(computeTrackingStep('shipped', null).step).toBe(7);
  });
});

describe('computeTrackingStep — batch leg (fulfillment_stage)', () => {
  it('advances the timeline to the batch stage while the order itself is only confirmed', () => {
    expect(computeTrackingStep('confirmed', 'preparing').step).toBe(2);
    expect(computeTrackingStep('confirmed', 'in_logistics').step).toBe(3);
    expect(computeTrackingStep('confirmed', 'enroute_ph').step).toBe(4);
    expect(computeTrackingStep('confirmed', 'arrived_ph').step).toBe(5);
  });

  it('ignores an unknown batch stage', () => {
    expect(computeTrackingStep('confirmed', 'bogus').step).toBe(1);
  });
});

describe('computeTrackingStep — merge precedence (whichever leg is further along)', () => {
  it('lets the local leg overtake the batch stage', () => {
    // The order is already being packed locally even though the batch field
    // still only says it arrived in PH.
    expect(computeTrackingStep('packing', 'arrived_ph').step).toBe(6);
  });

  it('keeps a delivered order delivered regardless of the batch stage', () => {
    expect(computeTrackingStep('delivered', 'preparing').step).toBe(8);
  });

  it('uses the batch stage when it is further along than the order status', () => {
    expect(computeTrackingStep('new', 'enroute_ph').step).toBe(4);
  });
});

describe('computeTrackingStep — cancelled', () => {
  it('is a terminal state independent of the batch stage', () => {
    const state = computeTrackingStep('cancelled', 'enroute_ph');
    expect(state.step).toBe(-1);
    expect(state.isCancelled).toBe(true);
    expect(state.current).toBeNull();
  });
});

describe('label helpers', () => {
  it('FULFILLMENT_STAGES lists the four international-leg stages in order', () => {
    expect(FULFILLMENT_STAGES.map((s) => s.value)).toEqual([
      'preparing',
      'in_logistics',
      'enroute_ph',
      'arrived_ph',
    ]);
  });

  it('fulfillmentStageLabel resolves known stages and falls back for none/unknown', () => {
    expect(fulfillmentStageLabel('enroute_ph')).toBe('On the way to PH');
    expect(fulfillmentStageLabel(null)).toBe('Not started');
    expect(fulfillmentStageLabel('bogus')).toBe('Not started');
  });

  it('ORDER_STATUS_OPTIONS covers the local-leg statuses an admin can set', () => {
    expect(ORDER_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'new',
      'confirmed',
      'packing',
      'out_for_delivery',
      'delivered',
      'cancelled',
    ]);
  });

  it('orderStatusLabel humanizes raw status values including legacy ones', () => {
    expect(orderStatusLabel('out_for_delivery')).toBe('Out for delivery');
    expect(orderStatusLabel('processing')).toBe('Processing');
    expect(orderStatusLabel('unknown')).toBe('unknown');
  });
});

describe('sequenceBundleOrders — numbering repeat orders from the same customer', () => {
  it('returns an empty list for an empty bundle', () => {
    expect(sequenceBundleOrders([])).toEqual([]);
  });

  it('labels a lone root order as Order 1', () => {
    const root = makeRow({ id: 'root', order_number: 'TBS-1', parent_order_id: null });
    const result = sequenceBundleOrders([root]);

    expect(result).toHaveLength(1);
    expect(result[0].sequence).toBe(1);
    expect(result[0].label).toBe('Order 1');
    expect(result[0].order.id).toBe('root');
  });

  it('numbers a repeat order from the same email as Order 2, root first', () => {
    const root = makeRow({
      id: 'root',
      order_number: 'TBS-1',
      parent_order_id: null,
      created_at: '2025-01-01T10:00:00Z',
    });
    const repeat = makeRow({
      id: 'repeat',
      order_number: 'TBS-2',
      parent_order_id: 'root',
      created_at: '2025-01-01T12:00:00Z',
    });

    // Pass repeat first to prove ordering is by linkage + created_at, not input order.
    const result = sequenceBundleOrders([repeat, root]);

    expect(result.map((r) => r.label)).toEqual(['Order 1', 'Order 2']);
    expect(result[0].order.id).toBe('root');
    expect(result[1].order.id).toBe('repeat');
  });

  it('orders multiple repeats by creation time', () => {
    const root = makeRow({ id: 'root', parent_order_id: null, created_at: '2025-01-01T08:00:00Z' });
    const second = makeRow({ id: 'second', parent_order_id: 'root', created_at: '2025-01-01T09:00:00Z' });
    const third = makeRow({ id: 'third', parent_order_id: 'root', created_at: '2025-01-01T10:00:00Z' });

    const result = sequenceBundleOrders([third, root, second]);

    expect(result.map((r) => r.order.id)).toEqual(['root', 'second', 'third']);
    expect(result.map((r) => r.sequence)).toEqual([1, 2, 3]);
  });

  it('excludes claim/add-on rows from the numbered orders', () => {
    const root = makeRow({ id: 'root', parent_order_id: null });
    const claim = makeRow({ id: 'claim', parent_order_id: 'root', is_claim: true });

    const result = sequenceBundleOrders([root, claim]);

    expect(result).toHaveLength(1);
    expect(result[0].order.id).toBe('root');
  });
});
