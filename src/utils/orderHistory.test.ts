import { describe, it, expect } from 'vitest';
import {
  deriveCharges,
  describeVariation,
  strengthLabel,
  buildStatusTimeline,
  isTimelinePartial,
  batchLabel,
} from './orderHistory';
import type { OrderHistoryRow, OrderHistoryLineItem } from '../types';

function makeItem(overrides: Partial<OrderHistoryLineItem> = {}): OrderHistoryLineItem {
  return {
    product_id: 'p1',
    product_name: 'Tirzepatide',
    variation_id: 'v1',
    variation_name: '10mg',
    quantity: 2,
    price: 2500,
    total: 5000,
    quantity_mg: 10,
    ...overrides,
  };
}

function makeRow(overrides: Partial<OrderHistoryRow> = {}): OrderHistoryRow {
  return {
    id: 'order-1',
    order_number: 'TBS-000123',
    created_at: '2026-03-01T02:00:00Z',
    customer_name: 'Maria Santos',
    customer_email: 'maria@example.com',
    customer_phone: '09171234567',
    contact_method: 'viber',
    shipping_address: '12 Mabini St',
    shipping_barangay: 'Poblacion',
    shipping_city: 'Makati',
    shipping_state: 'Metro Manila',
    shipping_zip_code: '1200',
    shipping_country: 'Philippines',
    shipping_location: 'NCR',
    shipping_provider: null,
    shipping_note: null,
    tracking_number: null,
    selected_sticker_name: null,
    notes: null,
    group_buy_batch_id: 'batch-1',
    batch_name: 'March Run',
    batch_number: 7,
    batch_status: 'open',
    fulfillment_stage: null,
    order_items: [makeItem()],
    total_price: 5000,
    shipping_fee: 200,
    discount_applied: 0,
    promo_code: null,
    paid_total: null,
    balance_due: 0,
    refunded_total: null,
    payment_type: 'pay_now',
    payment_method_name: 'GCash',
    payment_status: 'pending',
    order_status: 'new',
    status_events: [],
    is_claim: false,
    parent_order_id: null,
    ...overrides,
  };
}

describe('deriveCharges', () => {
  it('derives subtotal by adding the discount back to the stored total', () => {
    // Arrange — checkout stores total_price as (subtotal - discount), ex-shipping.
    const row = makeRow({ total_price: 4500, discount_applied: 500 });

    // Act
    const charges = deriveCharges(row);

    // Assert
    expect(charges.subtotal).toBe(5000);
    expect(charges.discount).toBe(500);
  });

  it('sums line item totals independently of the stored total', () => {
    const row = makeRow({
      order_items: [makeItem({ total: 5000 }), makeItem({ product_id: 'p2', total: 1500 })],
    });

    expect(deriveCharges(row).itemsTotal).toBe(6500);
  });

  it('adds shipping to reach the grand total', () => {
    const row = makeRow({ total_price: 5000, shipping_fee: 200 });

    const charges = deriveCharges(row);

    expect(charges.shippingFee).toBe(200);
    expect(charges.grandTotal).toBe(5200);
  });

  it('bills items plus shipping online for a Pay Now order and nothing on delivery', () => {
    const row = makeRow({ payment_type: 'pay_now', total_price: 5000, shipping_fee: 200 });

    const charges = deriveCharges(row);

    expect(charges.payableOnline).toBe(5200);
    expect(charges.payableOnDelivery).toBe(0);
  });

  it('leaves only the shipping fee for the courier on a COD order', () => {
    // COD settles the SHIPPING FEE only — the items are always bought online.
    const row = makeRow({ payment_type: 'cod', total_price: 5000, shipping_fee: 200 });

    const charges = deriveCharges(row);

    expect(charges.payableOnline).toBe(5000);
    expect(charges.payableOnDelivery).toBe(200);
    expect(charges.payableOnline + charges.payableOnDelivery).toBe(charges.grandTotal);
  });

  it('treats a missing payment_type as Pay Now, matching the column default', () => {
    const row = makeRow({ payment_type: null, total_price: 5000, shipping_fee: 200 });

    expect(deriveCharges(row).payableOnline).toBe(5200);
  });

  it('reports zero discount when discount_applied is null', () => {
    const row = makeRow({ discount_applied: null, total_price: 5000 });

    const charges = deriveCharges(row);

    expect(charges.discount).toBe(0);
    expect(charges.subtotal).toBe(5000);
  });

  it('surfaces the outstanding balance and refunded amount', () => {
    const row = makeRow({ balance_due: 750, refunded_total: 300 });

    const charges = deriveCharges(row);

    expect(charges.balanceDue).toBe(750);
    expect(charges.refunded).toBe(300);
  });
});

describe('strengthLabel', () => {
  it('renders the persisted milligram strength', () => {
    expect(strengthLabel(makeItem({ quantity_mg: 10 }))).toBe('10 mg');
  });

  it('keeps a fractional strength exact', () => {
    expect(strengthLabel(makeItem({ quantity_mg: 2.5 }))).toBe('2.5 mg');
  });

  it('returns null when no milligram strength was recorded', () => {
    expect(strengthLabel(makeItem({ quantity_mg: null }))).toBeNull();
  });
});

describe('describeVariation', () => {
  it('returns the variation name alone when it already states the strength', () => {
    // "10mg" already carries the number — appending "10 mg" would read twice.
    expect(describeVariation(makeItem({ variation_name: '10mg', quantity_mg: 10 }))).toBe('10mg');
  });

  it('appends the exact strength when the variation name omits it', () => {
    expect(describeVariation(makeItem({ variation_name: 'Blend A', quantity_mg: 10 }))).toBe(
      'Blend A · 10 mg',
    );
  });

  it('falls back to the strength alone when no variation name was stored', () => {
    expect(describeVariation(makeItem({ variation_name: null, quantity_mg: 5 }))).toBe('5 mg');
  });

  it('falls back to the stored variation name when the strength is unrecoverable', () => {
    // The variation row may have been deleted since the order was placed.
    expect(describeVariation(makeItem({ variation_name: '10mg', quantity_mg: null }))).toBe('10mg');
  });

  it('returns null for a product ordered without any variation', () => {
    expect(
      describeVariation(makeItem({ variation_id: null, variation_name: null, quantity_mg: null })),
    ).toBeNull();
  });
});

describe('buildStatusTimeline', () => {
  it('synthesizes a placed entry from created_at when no events were recorded', () => {
    const row = makeRow({ created_at: '2026-03-01T02:00:00Z', status_events: [] });

    const timeline = buildStatusTimeline(row);

    expect(timeline).toHaveLength(1);
    expect(timeline[0].kind).toBe('placed');
    expect(timeline[0].label).toBe('Order placed');
    expect(timeline[0].occurredAt).toBe('2026-03-01T02:00:00Z');
  });

  it('does not duplicate the placed entry when the database recorded one', () => {
    const row = makeRow({
      status_events: [
        { event_type: 'placed', from_value: null, to_value: 'new', occurred_at: '2026-03-01T02:00:00Z' },
      ],
    });

    const timeline = buildStatusTimeline(row);

    expect(timeline.filter((entry) => entry.kind === 'placed')).toHaveLength(1);
  });

  it('orders every entry oldest first', () => {
    const row = makeRow({
      status_events: [
        { event_type: 'order_status', from_value: 'confirmed', to_value: 'packing', occurred_at: '2026-03-05T00:00:00Z' },
        { event_type: 'payment_status', from_value: 'pending', to_value: 'paid', occurred_at: '2026-03-02T00:00:00Z' },
        { event_type: 'placed', from_value: null, to_value: 'new', occurred_at: '2026-03-01T02:00:00Z' },
      ],
    });

    const timeline = buildStatusTimeline(row);

    expect(timeline.map((entry) => entry.occurredAt)).toEqual([
      '2026-03-01T02:00:00Z',
      '2026-03-02T00:00:00Z',
      '2026-03-05T00:00:00Z',
    ]);
  });

  it('labels an order status change with its human wording', () => {
    const row = makeRow({
      status_events: [
        { event_type: 'order_status', from_value: 'confirmed', to_value: 'out_for_delivery', occurred_at: '2026-03-05T00:00:00Z' },
      ],
    });

    const entry = buildStatusTimeline(row).find((e) => e.kind === 'order_status');

    expect(entry?.label).toBe('Out for delivery');
    expect(entry?.detail).toBe('Changed from Confirmed');
  });

  it('reads a pending COD payment as Collect on Delivery', () => {
    const row = makeRow({
      payment_type: 'cod',
      status_events: [
        { event_type: 'payment_status', from_value: null, to_value: 'pending', occurred_at: '2026-03-02T00:00:00Z' },
      ],
    });

    const entry = buildStatusTimeline(row).find((e) => e.kind === 'payment_status');

    expect(entry?.label).toBe('Collect on Delivery');
  });

  it('labels a batch fulfillment stage with its shipment wording', () => {
    const row = makeRow({
      status_events: [
        { event_type: 'fulfillment_stage', from_value: 'preparing', to_value: 'enroute_ph', occurred_at: '2026-03-04T00:00:00Z' },
      ],
    });

    const entry = buildStatusTimeline(row).find((e) => e.kind === 'fulfillment_stage');

    expect(entry?.label).toBe('On the way to PH');
  });

  it('drops a batch stage event that predates the order', () => {
    // Batch stage events are shared by the whole batch; one recorded before this
    // order existed did not happen to this order.
    const row = makeRow({
      created_at: '2026-03-10T00:00:00Z',
      status_events: [
        { event_type: 'fulfillment_stage', from_value: null, to_value: 'preparing', occurred_at: '2026-03-01T00:00:00Z' },
      ],
    });

    expect(buildStatusTimeline(row).some((e) => e.kind === 'fulfillment_stage')).toBe(false);
  });
});

describe('isTimelinePartial', () => {
  it('flags an advanced order that carries no recorded events', () => {
    // Placed before the events table existed — its transitions were never logged.
    const row = makeRow({ order_status: 'delivered', payment_status: 'paid', status_events: [] });

    expect(isTimelinePartial(row)).toBe(true);
  });

  it('does not flag a brand new order that simply has nothing to show yet', () => {
    const row = makeRow({ order_status: 'new', payment_status: 'pending', status_events: [] });

    expect(isTimelinePartial(row)).toBe(false);
  });

  it('does not flag an order whose transitions were recorded', () => {
    const row = makeRow({
      order_status: 'delivered',
      payment_status: 'paid',
      status_events: [
        { event_type: 'order_status', from_value: 'packing', to_value: 'delivered', occurred_at: '2026-03-05T00:00:00Z' },
      ],
    });

    expect(isTimelinePartial(row)).toBe(false);
  });
});

describe('batchLabel', () => {
  it('shows the batch name alongside its number', () => {
    expect(batchLabel(makeRow({ batch_name: 'March Run', batch_number: 7 }))).toBe('Batch 7 · March Run');
  });

  it('falls back to the number when the batch was never named', () => {
    expect(batchLabel(makeRow({ batch_name: null, batch_number: 7 }))).toBe('Batch 7');
  });

  it('returns null for an order that belongs to no group buy', () => {
    expect(batchLabel(makeRow({ group_buy_batch_id: null, batch_name: null, batch_number: null }))).toBeNull();
  });
});
