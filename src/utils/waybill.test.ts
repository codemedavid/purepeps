import { describe, it, expect } from 'vitest';
import {
  buildWaybillData,
  canPrintWaybill,
  formatBatchLabel,
  type WaybillOrderInput,
} from './waybill';

function order(overrides: Partial<WaybillOrderInput> = {}): WaybillOrderInput {
  return {
    id: 'a1b2c3d4e5f6',
    order_number: 'PP-0001',
    customer_name: 'Jastine Moya',
    customer_email: 'jastine@example.com',
    customer_phone: '9356174116',
    shipping_address: 'KAIA Homes, Phase 2, Block 33, Lot 36',
    shipping_barangay: 'palangue 2',
    shipping_city: 'Naic',
    shipping_state: 'Cavite',
    shipping_zip_code: '4110',
    shipping_country: 'Philippines',
    shipping_fee: 100,
    shipping_provider: 'jnt',
    order_items: [
      { product_name: 'AOD-9604', variation_name: '5mg', price: 510.45, quantity: 4, total: 2041.8 },
      { product_name: 'MOTS-C', variation_name: '10mg', price: 325.95, quantity: 4, total: 1303.8 },
    ],
    subtotal: 3345.6,
    total_price: 3345.6,
    payment_method_name: 'GCash',
    payment_status: 'paid',
    order_status: 'confirmed',
    created_at: '2026-07-01T09:30:00Z',
    ...overrides,
  };
}

describe('canPrintWaybill', () => {
  it('allows confirmed and later fulfillment stages', () => {
    for (const status of ['confirmed', 'packing', 'out_for_delivery', 'delivered']) {
      expect(canPrintWaybill(status)).toBe(true);
    }
  });

  it('blocks unconfirmed and cancelled orders', () => {
    expect(canPrintWaybill('new')).toBe(false);
    expect(canPrintWaybill('cancelled')).toBe(false);
    expect(canPrintWaybill(null)).toBe(false);
    expect(canPrintWaybill(undefined)).toBe(false);
  });
});

describe('buildWaybillData', () => {
  it('sums the item totals into the order subtotal', () => {
    const data = buildWaybillData(order());
    expect(data.itemsSubtotal).toBeCloseTo(3345.6, 2);
  });

  it('adds admin fee and shipping fee into the grand total', () => {
    const data = buildWaybillData(order(), { adminFee: 150 });
    // 3345.60 items + 150 admin + 100 shipping
    expect(data.grandTotal).toBeCloseTo(3595.6, 2);
    expect(data.adminFee).toBe(150);
  });

  it('omits admin fee from the grand total when not provided', () => {
    const data = buildWaybillData(order());
    expect(data.adminFee).toBeNull();
    expect(data.grandTotal).toBeCloseTo(3445.6, 2); // items + shipping only
  });

  it('derives a line-item total from price × quantity when total is missing', () => {
    const data = buildWaybillData(
      order({ order_items: [{ product_name: 'BPC-157', price: 49, quantity: 8 }] }),
    );
    expect(data.items[0].total).toBe(392);
    expect(data.itemsSubtotal).toBe(392);
  });

  it('maps the address into municipality / province / barangay / postal code', () => {
    const data = buildWaybillData(order());
    expect(data.address.municipality).toBe('Naic');
    expect(data.address.province).toBe('Cavite');
    expect(data.address.barangay).toBe('palangue 2');
    expect(data.address.postalCode).toBe('4110');
    expect(data.address.hasAny).toBe(true);
  });

  it('flags the payment as confirmed only when paid', () => {
    expect(buildWaybillData(order({ payment_status: 'paid' })).isPaymentConfirmed).toBe(true);
    expect(buildWaybillData(order({ payment_status: 'pending' })).isPaymentConfirmed).toBe(false);
  });

  it('falls back to a short id when no order number exists', () => {
    const data = buildWaybillData(order({ order_number: null }));
    expect(data.orderNumber).toBe('A1B2C3D4');
  });

  it('encodes the order reference and grand total into the QR value', () => {
    const data = buildWaybillData(order(), { adminFee: 150 });
    expect(data.qrValue).toContain('PP-0001');
    expect(data.qrValue).toContain('a1b2c3d4e5f6');
    expect(data.qrValue).toContain('3595.60');
  });

  it('renders missing optional fields as null (shown as N/A by the UI)', () => {
    const data = buildWaybillData(
      order({ shipping_provider: null, payment_method_name: null, tracking_number: null }),
    );
    expect(data.shipping.courier).toBeNull();
    expect(data.paymentMethod).toBeNull();
    expect(data.shipping.trackingNumber).toBeNull();
  });
});

describe('formatBatchLabel', () => {
  it('joins the batch number and name', () => {
    expect(formatBatchLabel(3, 'Recovery drop')).toBe('Batch #3 · Recovery drop');
  });

  it('omits the name when absent', () => {
    expect(formatBatchLabel(3, null)).toBe('Batch #3');
  });

  it('returns null when there is no batch number', () => {
    expect(formatBatchLabel(null, null)).toBeNull();
  });
});
