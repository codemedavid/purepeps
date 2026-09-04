import { describe, it, expect } from 'vitest';
import {
  buildGroupWaybillData,
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

  it('encodes a site tracking URL for the order into the QR value', () => {
    const data = buildWaybillData(order(), { adminFee: 150 });
    // Scanning the QR must open the customer tracking page for this order.
    expect(data.qrValue).toBe('https://purepeps.vercel.app/track-order?order=PP-0001');
    expect(data.trackingUrl).toBe(data.qrValue);
  });

  it('url-encodes an order number with unsafe characters in the tracking URL', () => {
    const data = buildWaybillData(order({ order_number: 'PP 0001/AF' }));
    expect(data.trackingUrl).toBe(
      'https://purepeps.vercel.app/track-order?order=PP%200001%2FAF',
    );
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

describe('buildGroupWaybillData (one customer, all their group-buy orders)', () => {
  // A second order (bump / repeat checkout) from the same customer in the batch.
  function secondOrder(overrides: Partial<WaybillOrderInput> = {}): WaybillOrderInput {
    return order({
      id: 'f6e5d4c3b2a1',
      order_number: 'PP-0002',
      shipping_fee: 60,
      order_items: [
        { product_name: 'BPC-157', variation_name: '5mg', price: 49, quantity: 2, total: 98 },
      ],
      total_price: 98,
      ...overrides,
    });
  }

  it('concatenates every order line item into a single consolidated table', () => {
    const data = buildGroupWaybillData([order(), secondOrder()]);
    // 2 items from order() + 1 from secondOrder()
    expect(data.items).toHaveLength(3);
    expect(data.items.map((i) => i.name)).toContain('BPC-157 — 5mg');
    // 3345.60 (order) + 98 (second) items
    expect(data.itemsSubtotal).toBeCloseTo(3443.6, 2);
  });

  it('sums shipping across orders, counts admin fee once, into the grand total', () => {
    const data = buildGroupWaybillData([order(), secondOrder()], { adminFee: 150 });
    // shipping 100 + 60 summed; admin fee 150 charged once (paid per batch, not per order)
    expect(data.shipping.fee).toBe(160);
    expect(data.adminFee).toBe(150);
    // items 3443.60 + shipping 160 + admin 150
    expect(data.grandTotal).toBeCloseTo(3753.6, 2);
  });

  it('uses the first (root) order for the customer identity and reference', () => {
    const data = buildGroupWaybillData([order(), secondOrder()]);
    expect(data.orderNumber).toBe('PP-0001');
    expect(data.orderId).toBe('a1b2c3d4e5f6');
    expect(data.customer.name).toBe('Jastine Moya');
  });

  it('records how many orders were consolidated and their references', () => {
    const data = buildGroupWaybillData([order(), secondOrder()]);
    expect(data.orderCount).toBe(2);
    expect(data.orderNumbers).toEqual(['PP-0001', 'PP-0002']);
  });

  it('confirms payment only when every order in the group is paid', () => {
    expect(buildGroupWaybillData([order(), secondOrder()]).isPaymentConfirmed).toBe(true);
    expect(
      buildGroupWaybillData([order(), secondOrder({ payment_status: 'pending' })])
        .isPaymentConfirmed,
    ).toBe(false);
  });

  it('encodes the root order tracking URL for the whole group', () => {
    const data = buildGroupWaybillData([order(), secondOrder()]);
    expect(data.qrValue).toBe('https://purepeps.vercel.app/track-order?order=PP-0001');
  });

  it('matches buildWaybillData for a single-order group', () => {
    const single = buildWaybillData(order(), { adminFee: 150 });
    const grouped = buildGroupWaybillData([order()], { adminFee: 150 });
    expect(grouped.grandTotal).toBe(single.grandTotal);
    expect(grouped.itemsSubtotal).toBe(single.itemsSubtotal);
    expect(grouped.orderCount).toBe(1);
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

// --- Cash on Delivery ---
// The courier reads this sheet to know whether to take money. A COD waybill
// that does not say COLLECT is a direct cash-loss path, so these assertions
// guard money, not cosmetics.

describe('waybill — cash on delivery', () => {
  const codOrder = (overrides: Partial<WaybillOrderInput> = {}) =>
    order({
      payment_type: 'cod',
      payment_status: 'pending',
      payment_method_name: null,
      ...overrides,
    });

  it('flags a COD order as collect-on-delivery', () => {
    const data = buildWaybillData(codOrder());

    expect(data.isCashOnDelivery).toBe(true);
  });

  it('states the exact cash to collect: the shipping fee alone', () => {
    // 3345.60 of items was paid online at checkout; only the ₱100 fee is owed.
    const data = buildWaybillData(codOrder());

    expect(data.codAmountDue).toBeCloseTo(100, 2);
  });

  it('never asks the courier to collect the goods a second time', () => {
    const data = buildWaybillData(codOrder());

    expect(data.codAmountDue).toBeLessThan(data.grandTotal);
    expect(data.codAmountDue).not.toBeCloseTo(3445.6, 2);
  });

  it('never reads as paid while the cash is still uncollected', () => {
    const data = buildWaybillData(codOrder());

    expect(data.isPaymentConfirmed).toBe(false);
    expect(data.paymentStatusLabel).toBe('Collect on Delivery');
  });

  it('stops flagging collection once the courier has remitted', () => {
    const data = buildWaybillData(codOrder({ payment_status: 'paid' }));

    expect(data.isPaymentConfirmed).toBe(true);
    expect(data.codAmountDue).toBe(0);
  });

  it('leaves a prepaid Pay Now order alone', () => {
    const data = buildWaybillData(order({ payment_type: 'pay_now' }));

    expect(data.isCashOnDelivery).toBe(false);
    expect(data.codAmountDue).toBe(0);
    expect(data.isPaymentConfirmed).toBe(true);
  });

  it('treats a legacy order with no payment_type as prepaid', () => {
    const data = buildWaybillData(order({ payment_type: undefined }));

    expect(data.isCashOnDelivery).toBe(false);
  });

  it('sums the shipping fees across a consolidated COD waybill', () => {
    // Two COD orders on one sheet: both fees, neither order total.
    const data = buildGroupWaybillData([
      codOrder({ id: 'aaa', order_number: 'PP-0001' }),
      codOrder({ id: 'bbb', order_number: 'PP-0002', shipping_fee: 0 }),
    ]);

    expect(data.isCashOnDelivery).toBe(true);
    expect(data.codAmountDue).toBeCloseTo(100 + 0, 2);
  });

  it('collects only the unpaid orders when a consolidated sheet is mixed', () => {
    const data = buildGroupWaybillData([
      codOrder({ id: 'aaa', order_number: 'PP-0001' }),
      codOrder({ id: 'bbb', order_number: 'PP-0002', shipping_fee: 0, payment_status: 'paid' }),
    ]);

    expect(data.codAmountDue).toBeCloseTo(100, 2);
  });
});

// --- One sheet, two numbers that must not be confused ---
// The courier acts on this paper. COLLECT ON DELIVERY and Grand total are
// DIFFERENT figures now — the goods were paid online — so the risk has flipped:
// the danger is no longer that they disagree, it is that someone reads the
// grand total as the amount to collect.

describe('waybill — COD figure stays clear of the printed total', () => {
  const discounted = (overrides: Partial<WaybillOrderInput> = {}) =>
    order({
      payment_type: 'cod',
      payment_status: 'pending',
      payment_method_name: null,
      // items total 3345.60, but a ₱500 promo means the customer owes 2845.60.
      total_price: 2845.6,
      ...overrides,
    });

  it('shows the discount that total_price already carries', () => {
    const data = buildWaybillData(discounted());

    expect(data.discountTotal).toBeCloseTo(500, 2);
  });

  it('grand total reflects the discount the customer actually got', () => {
    // 3345.60 items - 500 discount + 100 shipping.
    const data = buildWaybillData(discounted());

    expect(data.grandTotal).toBeCloseTo(2945.6, 2);
  });

  it('collects only the shipping fee on a fully COD sheet, never the grand total', () => {
    // The invariant that matters now: the collect figure is the FEE, and the
    // discount the shopper won belongs to the online payment, not the courier.
    const data = buildWaybillData(discounted());

    expect(data.codAmountDue).toBeCloseTo(100, 2);
    expect(data.grandTotal).toBeCloseTo(2945.6, 2);
    expect(data.codAmountDue).toBeLessThan(data.grandTotal);
  });

  it('excludes the batch access fee, which is settled before ordering', () => {
    // The access fee is paid through the access flow to unlock checkout at all,
    // so it is not money the courier is owed on the doorstep.
    const data = buildWaybillData(discounted(), { adminFee: 250 });

    expect(data.grandTotal).toBeCloseTo(3195.6, 2);
    expect(data.codAmountDue).toBeCloseTo(100, 2);
  });

  it('reports no discount when none was applied', () => {
    const data = buildWaybillData(order({ payment_type: 'pay_now' }));

    expect(data.discountTotal).toBe(0);
    expect(data.grandTotal).toBeCloseTo(3445.6, 2);
  });

  it('collects only the unpaid share on a mixed sheet, never the whole total', () => {
    const data = buildGroupWaybillData([
      discounted({ id: 'aaa', order_number: 'PP-0001' }),
      discounted({ id: 'bbb', order_number: 'PP-0002', payment_status: 'paid' }),
    ]);

    // One outstanding fee out of two orders on the sheet.
    expect(data.codAmountDue).toBeCloseTo(100, 2);
    expect(data.codAmountDue).toBeLessThan(data.grandTotal);
  });
});
