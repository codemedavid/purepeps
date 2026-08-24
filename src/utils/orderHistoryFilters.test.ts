import { describe, it, expect } from 'vitest';
import { filterOrderHistory, deriveFilterOptions, hasActiveFilters } from './orderHistoryFilters';
import type { OrderHistoryRow } from '../types';

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
    order_items: [
      {
        product_id: 'p1',
        product_name: 'Tirzepatide',
        variation_id: 'v1',
        variation_name: '10mg',
        quantity: 2,
        price: 2500,
        total: 5000,
        quantity_mg: 10,
      },
    ],
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

/** A local calendar date, formatted the way <input type="date"> emits it. */
function localDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('filterOrderHistory', () => {
  const maria = makeRow({ id: 'a', order_number: 'TBS-000123', customer_name: 'Maria Santos' });
  const jose = makeRow({
    id: 'b',
    order_number: 'TBS-000456',
    customer_name: 'Jose Rizal',
    batch_name: 'April Run',
    batch_number: 8,
    group_buy_batch_id: 'batch-2',
    payment_status: 'paid',
    order_status: 'delivered',
    created_at: '2026-04-10T02:00:00Z',
    order_items: [
      {
        product_id: 'p2',
        product_name: 'Retatrutide',
        variation_id: null,
        variation_name: null,
        quantity: 1,
        price: 3000,
        total: 3000,
        quantity_mg: null,
      },
    ],
  });
  const rows = [maria, jose];

  it('returns every order when no criteria are set', () => {
    expect(filterOrderHistory(rows, {})).toHaveLength(2);
  });

  it('matches an order number by partial text', () => {
    expect(filterOrderHistory(rows, { query: '456' }).map((r) => r.id)).toEqual(['b']);
  });

  it('matches a customer name case-insensitively', () => {
    expect(filterOrderHistory(rows, { query: 'maria' }).map((r) => r.id)).toEqual(['a']);
  });

  it('matches a product name', () => {
    expect(filterOrderHistory(rows, { query: 'retatrutide' }).map((r) => r.id)).toEqual(['b']);
  });

  it('matches a group buy by name', () => {
    expect(filterOrderHistory(rows, { query: 'april' }).map((r) => r.id)).toEqual(['b']);
  });

  it('matches a group buy by its batch number', () => {
    expect(filterOrderHistory(rows, { query: 'batch 8' }).map((r) => r.id)).toEqual(['b']);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterOrderHistory(rows, { query: '   maria   ' }).map((r) => r.id)).toEqual(['a']);
  });

  it('returns nothing when the query matches no order', () => {
    expect(filterOrderHistory(rows, { query: 'nonexistent' })).toEqual([]);
  });

  it('filters by an exact customer selection', () => {
    expect(filterOrderHistory(rows, { customer: 'Jose Rizal' }).map((r) => r.id)).toEqual(['b']);
  });

  it('filters by an exact order number', () => {
    expect(filterOrderHistory(rows, { orderNumber: 'TBS-000123' }).map((r) => r.id)).toEqual(['a']);
  });

  it('filters by group buy batch', () => {
    expect(filterOrderHistory(rows, { batch: 'batch-2' }).map((r) => r.id)).toEqual(['b']);
  });

  it('filters by payment status', () => {
    expect(filterOrderHistory(rows, { paymentStatus: 'paid' }).map((r) => r.id)).toEqual(['b']);
  });

  it('filters by order status', () => {
    expect(filterOrderHistory(rows, { orderStatus: 'delivered' }).map((r) => r.id)).toEqual(['b']);
  });

  it('includes orders placed on the dateFrom boundary day', () => {
    expect(filterOrderHistory(rows, { dateFrom: localDate(jose.created_at) }).map((r) => r.id)).toEqual(['b']);
  });

  it('includes orders placed on the dateTo boundary day', () => {
    expect(filterOrderHistory(rows, { dateTo: localDate(maria.created_at) }).map((r) => r.id)).toEqual(['a']);
  });

  it('combines a date range with a status filter', () => {
    const result = filterOrderHistory(rows, {
      dateFrom: localDate(maria.created_at),
      dateTo: localDate(jose.created_at),
      orderStatus: 'delivered',
    });

    expect(result.map((r) => r.id)).toEqual(['b']);
  });

  it('applies every criterion together, not just the first match', () => {
    // Jose matches the customer but not the payment status — expect no rows.
    expect(filterOrderHistory(rows, { customer: 'Jose Rizal', paymentStatus: 'pending' })).toEqual([]);
  });

  it('does not mutate the array it was given', () => {
    const input = [maria, jose];
    filterOrderHistory(input, { query: 'maria' });
    expect(input).toHaveLength(2);
  });
});

describe('deriveFilterOptions', () => {
  const rows = [
    makeRow({ id: 'a', customer_name: 'Maria Santos', payment_status: 'pending', order_status: 'new' }),
    makeRow({
      id: 'b',
      customer_name: 'Jose Rizal',
      group_buy_batch_id: 'batch-2',
      batch_name: 'April Run',
      batch_number: 8,
      payment_status: 'paid',
      order_status: 'delivered',
    }),
    makeRow({ id: 'c', customer_name: 'Maria Santos', payment_status: 'paid', order_status: 'delivered' }),
  ];

  it('lists each distinct customer once, alphabetically', () => {
    expect(deriveFilterOptions(rows).customers).toEqual(['Jose Rizal', 'Maria Santos']);
  });

  it('lists each distinct group buy once with a readable label', () => {
    expect(deriveFilterOptions(rows).batches).toEqual([
      { id: 'batch-1', label: 'Batch 7 · March Run' },
      { id: 'batch-2', label: 'Batch 8 · April Run' },
    ]);
  });

  it('offers only the payment statuses actually present', () => {
    expect(deriveFilterOptions(rows).paymentStatuses).toEqual([
      { value: 'paid', label: 'Paid' },
      { value: 'pending', label: 'Pending Payment' },
    ]);
  });

  it('offers only the order statuses actually present', () => {
    expect(deriveFilterOptions(rows).orderStatuses).toEqual([
      { value: 'delivered', label: 'Delivered' },
      { value: 'new', label: 'New' },
    ]);
  });

  it('returns empty option lists for an empty history', () => {
    const options = deriveFilterOptions([]);

    expect(options.customers).toEqual([]);
    expect(options.batches).toEqual([]);
    expect(options.paymentStatuses).toEqual([]);
    expect(options.orderStatuses).toEqual([]);
  });
});

describe('hasActiveFilters', () => {
  it('is false for empty criteria', () => {
    expect(hasActiveFilters({})).toBe(false);
  });

  it('is false when every field is blank', () => {
    expect(hasActiveFilters({ query: '   ', customer: '', orderStatus: '' })).toBe(false);
  });

  it('is true once any criterion carries a value', () => {
    expect(hasActiveFilters({ orderStatus: 'delivered' })).toBe(true);
  });
});
