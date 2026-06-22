import { describe, it, expect } from 'vitest';
import {
  buildItemRevenueCsv,
  buildOrderListCsv,
  buildBatchCloseoutCsv,
} from './batchCloseoutExport';
import type { ItemRevenueSummary } from './groupBuyOverview';
import type { BatchOrder, OrderLineItem } from '../types';

function summary(overrides: Partial<ItemRevenueSummary> = {}): ItemRevenueSummary {
  return {
    rows: [
      {
        product_id: 'p1',
        product_name: 'BPC-157 5mg',
        orderCount: 2,
        unitsOrdered: 3,
        unitsConfirmed: 2,
        unitsPending: 1,
        grossRevenue: 3000,
        collectedRevenue: 2000,
      },
    ],
    totalUnitsOrdered: 3,
    totalUnitsConfirmed: 2,
    totalUnitsPending: 1,
    totalGrossRevenue: 3000,
    totalCollectedRevenue: 2000,
    ...overrides,
  };
}

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

function order(overrides: Partial<BatchOrder> = {}): BatchOrder {
  return {
    id: 'order-abcdef12',
    order_number: 'PP-1001',
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
    order_items: [lineItem({ quantity: 2 })],
    subtotal: 2000,
    total_price: 2000,
    shipping_fee: 0,
    payment_method_name: 'GCash',
    payment_proof_url: null,
    payment_status: 'paid',
    order_status: 'confirmed',
    admin_notes: null,
    notes: null,
    tracking_number: 'TRK123',
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

describe('buildItemRevenueCsv', () => {
  it('emits a header, a row per product, and a totals row', () => {
    const lines = buildItemRevenueCsv(summary()).split('\n');
    expect(lines[0]).toBe('Product,Orders,Units ordered,Confirmed,Pending,Gross revenue,Collected revenue');
    expect(lines[1]).toBe('BPC-157 5mg,2,3,2,1,3000.00,2000.00');
    expect(lines[2]).toBe('TOTAL,,3,2,1,3000.00,2000.00');
  });

  it('quotes product names that contain commas', () => {
    const csv = buildItemRevenueCsv(
      summary({
        rows: [
          {
            product_id: 'p1',
            product_name: 'BPC-157, 5mg',
            orderCount: 1,
            unitsOrdered: 1,
            unitsConfirmed: 1,
            unitsPending: 0,
            grossRevenue: 1000,
            collectedRevenue: 1000,
          },
        ],
      }),
    );
    expect(csv).toContain('"BPC-157, 5mg"');
  });

  it('formats revenue with two decimals', () => {
    const csv = buildItemRevenueCsv(summary({ totalGrossRevenue: 1234.5 }));
    expect(csv).toContain('1234.50');
  });
});

describe('buildOrderListCsv', () => {
  it('emits a header and one row per order with units and total', () => {
    const lines = buildOrderListCsv([order()]).split('\n');
    expect(lines[0]).toBe('Order #,Customer,Phone,Status,Payment,Tracking,Units,Total');
    expect(lines[1]).toBe('PP-1001,Jane Dela Cruz,09170000000,confirmed,paid,TRK123,2,2000.00');
  });

  it('falls back to a short id when the order number is missing', () => {
    const csv = buildOrderListCsv([order({ order_number: null })]);
    expect(csv).toContain('order-ab,');
  });

  it('escapes a customer name containing a comma', () => {
    const csv = buildOrderListCsv([order({ customer_name: 'Cruz, Jane' })]);
    expect(csv).toContain('"Cruz, Jane"');
  });
});

describe('buildBatchCloseoutCsv', () => {
  it('joins the item breakdown and the order list under an ORDERS heading', () => {
    const csv = buildBatchCloseoutCsv(summary(), [order()]);
    expect(csv).toContain('Product,Orders,Units ordered');
    expect(csv).toContain('\n\nORDERS\n');
    expect(csv).toContain('Order #,Customer,Phone');
  });
});
