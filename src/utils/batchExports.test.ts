import { describe, it, expect } from 'vitest';
import {
  flattenProductVariations,
  buildItemsByVariationCsv,
  buildMembersExportCsv,
} from './batchExports';
import type { BatchOrder, OrderLineItem } from '../types';

function lineItem(overrides: Partial<OrderLineItem> = {}): OrderLineItem {
  return {
    product_id: 'p1',
    product_name: 'Tirzepatide',
    variation_id: 'v15',
    variation_name: '15mg',
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
    selected_sticker_id: null,
    selected_sticker_name: null,
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
    paid_total: 1000,
    payment_method_name: 'GCash',
    payment_proof_url: 'https://cdn.example.com/proof-1.jpg',
    additional_payment_proof_url: null,
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

describe('flattenProductVariations', () => {
  it('aggregates units per product+variation across orders, excluding cancelled', () => {
    const orders = [
      order({ order_items: [lineItem({ quantity: 10 })] }),
      order({ id: 'o2', order_items: [lineItem({ quantity: 20 })] }),
      // A different variation of the same product.
      order({
        id: 'o3',
        order_items: [lineItem({ variation_id: 'v30', variation_name: '30mg', quantity: 5 })],
      }),
      // Cancelled order must not count.
      order({ id: 'o4', order_status: 'cancelled', order_items: [lineItem({ quantity: 99 })] }),
    ];

    const rows = flattenProductVariations(orders);

    expect(rows).toHaveLength(2);
    const fifteen = rows.find((r) => r.variation_name === '15mg');
    expect(fifteen).toMatchObject({
      product_name: 'Tirzepatide',
      variation_name: '15mg',
      orderCount: 2,
      unitsOrdered: 30,
    });
    const thirty = rows.find((r) => r.variation_name === '30mg');
    expect(thirty?.unitsOrdered).toBe(5);
  });

  it('labels a null variation as Standard', () => {
    const rows = flattenProductVariations([
      order({ order_items: [lineItem({ variation_id: null, variation_name: null, quantity: 2 })] }),
    ]);
    expect(rows[0].variation_name).toBe('Standard');
  });

  it('splits confirmed vs pending by order status', () => {
    const rows = flattenProductVariations([
      order({ id: 'a', order_status: 'new', order_items: [lineItem({ quantity: 4 })] }),
      order({ id: 'b', order_status: 'confirmed', order_items: [lineItem({ quantity: 6 })] }),
    ]);
    expect(rows[0]).toMatchObject({ unitsOrdered: 10, unitsConfirmed: 6, unitsPending: 4 });
  });
});

describe('buildItemsByVariationCsv', () => {
  it('emits a header, a row per product+variation in kits, and a totals row', () => {
    const orders = [
      order({ order_items: [lineItem({ quantity: 30 })] }), // Tirzepatide 15mg -> 3 kits
    ];
    const lines = buildItemsByVariationCsv(orders).split('\n');
    expect(lines[0]).toBe('Product,Variation,Orders,Vials,Kits,Confirmed,Pending');
    expect(lines[1]).toBe('Tirzepatide,15mg,1,30,3,30,0');
    expect(lines[2]).toBe('TOTAL,,,30,3,30,0');
  });

  it('renders partial kits with one decimal', () => {
    const csv = buildItemsByVariationCsv([
      order({ order_items: [lineItem({ quantity: 25 })] }),
    ]);
    expect(csv).toContain('Tirzepatide,15mg,1,25,2.5,25,0');
  });

  it('quotes product names containing commas', () => {
    const csv = buildItemsByVariationCsv([
      order({ order_items: [lineItem({ product_name: 'Tirz, blend', quantity: 10 })] }),
    ]);
    expect(csv).toContain('"Tirz, blend"');
  });
});

describe('buildMembersExportCsv', () => {
  it('emits one row per order with the payment proof link and a per-member total', () => {
    const orders = [
      order({
        id: 'o1',
        order_number: 'PP-1',
        customer_email: 'jane@example.com',
        total_price: 1000,
        payment_proof_url: 'https://cdn.example.com/a.jpg',
        order_items: [lineItem({ quantity: 2 })],
      }),
      order({
        id: 'o2',
        order_number: 'PP-2',
        customer_email: 'jane@example.com',
        total_price: 500,
        payment_proof_url: 'https://cdn.example.com/b.jpg',
        order_items: [lineItem({ quantity: 1 })],
      }),
    ];
    const lines = buildMembersExportCsv(orders).split('\n');
    expect(lines[0]).toBe(
      'Email,Name,Phone,Order #,Status,Payment,Items,Vials,Order total,Member total,Payment proof,Extra proof,Date',
    );
    // Both of Jane's orders show the same member total (1500.00).
    expect(lines[1]).toContain('jane@example.com,Jane Dela Cruz,09170000000,PP-1');
    expect(lines[1]).toContain('https://cdn.example.com/a.jpg');
    expect(lines[1]).toContain('1000.00,1500.00');
    expect(lines[2]).toContain('1500.00');
  });

  it('sorts rows by email then creation time', () => {
    const orders = [
      order({ id: 'z', customer_email: 'zoe@example.com', created_at: '2026-06-03T00:00:00Z' }),
      order({ id: 'a2', customer_email: 'amy@example.com', created_at: '2026-06-02T00:00:00Z' }),
      order({ id: 'a1', customer_email: 'amy@example.com', created_at: '2026-06-01T00:00:00Z' }),
    ];
    const lines = buildMembersExportCsv(orders).split('\n').slice(1);
    expect(lines[0]).toContain('amy@example.com');
    expect(lines[0]).toContain('2026-06-01');
    expect(lines[1]).toContain('2026-06-02');
    expect(lines[2]).toContain('zoe@example.com');
  });

  it('excludes cancelled orders from the member total but still lists them', () => {
    const orders = [
      order({ id: 'ok', total_price: 800, order_status: 'confirmed' }),
      order({ id: 'x', total_price: 999, order_status: 'cancelled' }),
    ];
    const csv = buildMembersExportCsv(orders);
    // Member total reflects only the non-cancelled 800.00, shown on every row.
    expect(csv).toContain('800.00,800.00');
    // The cancelled order is still present as a row for the payment record.
    expect(csv).toContain('cancelled');
  });

  it('summarizes line items and includes the extra payment proof', () => {
    const csv = buildMembersExportCsv([
      order({
        order_items: [
          lineItem({ product_name: 'Tirzepatide', variation_name: '15mg', quantity: 3 }),
          lineItem({ product_name: 'BPC-157', variation_name: null, quantity: 1 }),
        ],
        additional_payment_proof_url: 'https://cdn.example.com/extra.jpg',
      }),
    ]);
    expect(csv).toContain('Tirzepatide 15mg ×3; BPC-157 ×1');
    expect(csv).toContain('https://cdn.example.com/extra.jpg');
  });

  it('falls back to a short id when the order number is missing', () => {
    const csv = buildMembersExportCsv([order({ order_number: null })]);
    expect(csv).toContain(',order-ab,');
  });
});
