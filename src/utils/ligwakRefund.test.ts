import { describe, it, expect } from 'vitest';
import { computeLigwakRefund, type LigwakRefundInput } from './ligwakRefund';

/** A fully paid Pay Now order: 10 vials at 1000, no discount, 500 shipping. */
function input(overrides: Partial<LigwakRefundInput> = {}): LigwakRefundInput {
  return {
    order: {
      subtotal: 10000,
      total_price: 10000,
      shipping_fee: 500,
      paid_total: 10500,
      refunded_total: null,
      payment_type: 'pay_now',
      payment_status: 'paid',
    },
    linePrice: 1000,
    lineQuantity: 10,
    ligwakQty: 3,
    isEntireOrderLigwak: false,
    ...overrides,
  };
}

describe('computeLigwakRefund — only the affected vials', () => {
  it('refunds the ligwak vials at the price actually paid for them', () => {
    expect(computeLigwakRefund(input()).refundAmount).toBe(3000);
  });

  it('refunds nothing when no vial is ligwak', () => {
    const result = computeLigwakRefund(input({ ligwakQty: 0 }));

    expect(result.refundAmount).toBe(0);
    expect(result.refundStatus).toBe('no_refund_required');
  });

  it('starts an owed refund in the For Review queue', () => {
    expect(computeLigwakRefund(input()).refundStatus).toBe('for_review');
  });
});

describe('computeLigwakRefund — the customer s ACTUAL payment, not list price', () => {
  // total_price is stored as subtotal minus the promo discount, so refunding
  // list price would hand back money the customer never paid.
  it('prorates an order-level discount across the refunded vials', () => {
    const result = computeLigwakRefund(
      input({
        order: {
          subtotal: 10000,
          total_price: 9000, // 10% promo
          shipping_fee: 500,
          paid_total: 9500,
          refunded_total: null,
          payment_type: 'pay_now',
          payment_status: 'paid',
        },
      }),
    );

    // 3 vials x (1000 x 0.9) = 2700, not 3000.
    expect(result.refundAmount).toBe(2700);
  });

  it('charges the discount only against the line being refunded', () => {
    // Two lines of 5000 each; the ligwak line is 1000 x 5.
    const result = computeLigwakRefund(
      input({
        order: {
          subtotal: 10000,
          total_price: 8000, // 20% off the whole order
          shipping_fee: 500,
          paid_total: 8500,
          refunded_total: null,
          payment_type: 'pay_now',
          payment_status: 'paid',
        },
        linePrice: 1000,
        lineQuantity: 5,
        ligwakQty: 2,
      }),
    );

    expect(result.refundAmount).toBe(1600); // 2 x (1000 x 0.8)
  });

  it('never refunds more than was actually received', () => {
    const result = computeLigwakRefund(
      input({
        order: {
          subtotal: 10000,
          total_price: 10000,
          shipping_fee: 500,
          paid_total: 2000, // customer only ever paid a deposit
          refunded_total: null,
          payment_type: 'pay_now',
          payment_status: 'paid',
        },
      }),
    );

    expect(result.refundAmount).toBe(2000);
  });

  it('subtracts what has already been handed back', () => {
    const result = computeLigwakRefund(
      input({
        order: {
          subtotal: 10000,
          total_price: 10000,
          shipping_fee: 500,
          paid_total: 10500,
          refunded_total: 9000,
          payment_type: 'pay_now',
          payment_status: 'paid',
        },
      }),
    );

    // 3000 owed but only 1500 of the payment is left unrefunded.
    expect(result.refundAmount).toBe(1500);
  });

  it('requires no refund when nothing was ever collected', () => {
    const result = computeLigwakRefund(
      input({
        order: {
          subtotal: 10000,
          total_price: 10000,
          shipping_fee: 500,
          paid_total: null,
          refunded_total: null,
          payment_type: 'pay_now',
          payment_status: 'pending',
        },
      }),
    );

    expect(result.refundAmount).toBe(0);
    expect(result.refundStatus).toBe('no_refund_required');
  });

  it('falls back to the line total when a legacy row has no subtotal', () => {
    const result = computeLigwakRefund(
      input({
        order: {
          subtotal: null,
          total_price: 10000,
          shipping_fee: 500,
          paid_total: 10500,
          refunded_total: null,
          payment_type: 'pay_now',
          payment_status: 'paid',
        },
      }),
    );

    expect(result.refundAmount).toBe(3000);
  });

  it('rounds to whole centavos', () => {
    const result = computeLigwakRefund(
      input({
        order: {
          subtotal: 3000,
          total_price: 2000, // ratio 0.6666...
          shipping_fee: 0,
          paid_total: 2000,
          refunded_total: null,
          payment_type: 'pay_now',
          payment_status: 'paid',
        },
        linePrice: 1000,
        lineQuantity: 3,
        ligwakQty: 1,
      }),
    );

    expect(result.refundAmount).toBe(666.67);
  });
});

describe('computeLigwakRefund — COD customers have already paid for their items', () => {
  // Cash on Delivery covers the SHIPPING FEE only. The vials themselves were
  // bought online at checkout with a receipt, exactly like Pay Now. Marking a
  // COD ligwak customer "No Refund Required" would keep money they did pay.
  it('refunds a COD customer for their ligwak vials', () => {
    const result = computeLigwakRefund(
      input({
        order: {
          subtotal: 10000,
          total_price: 10000,
          shipping_fee: 500,
          paid_total: 10000, // items paid online; the 500 fee is not collected yet
          refunded_total: null,
          payment_type: 'cod',
          payment_status: 'pending', // "Collect on Delivery" — normal for COD
        },
      }),
    );

    expect(result.refundAmount).toBe(3000);
    expect(result.refundStatus).toBe('for_review');
  });

  it('requires no refund from a COD order whose items were never paid for', () => {
    const result = computeLigwakRefund(
      input({
        order: {
          subtotal: 10000,
          total_price: 10000,
          shipping_fee: 500,
          paid_total: null,
          refunded_total: null,
          payment_type: 'cod',
          payment_status: 'pending',
        },
      }),
    );

    expect(result.refundAmount).toBe(0);
    expect(result.refundStatus).toBe('no_refund_required');
  });
});

describe('computeLigwakRefund — the shipping fee', () => {
  it('returns the prepaid shipping fee when the whole order is ligwak', () => {
    const result = computeLigwakRefund(input({ ligwakQty: 10, isEntireOrderLigwak: true }));

    // Nothing ships, so the fee the customer already paid comes back too.
    expect(result.refundAmount).toBe(10500);
    expect(result.shippingRefunded).toBe(500);
  });

  it('keeps the shipping fee when the order is only partly ligwak', () => {
    const result = computeLigwakRefund(input({ ligwakQty: 3, isEntireOrderLigwak: false }));

    // The parcel still ships with the confirmed vials.
    expect(result.shippingRefunded).toBe(0);
  });

  it('does not refund a COD shipping fee that was never collected', () => {
    const result = computeLigwakRefund(
      input({
        order: {
          subtotal: 10000,
          total_price: 10000,
          shipping_fee: 500,
          paid_total: 10000, // items only — the courier never collected the fee
          refunded_total: null,
          payment_type: 'cod',
          payment_status: 'pending',
        },
        ligwakQty: 10,
        isEntireOrderLigwak: true,
      }),
    );

    expect(result.shippingRefunded).toBe(0);
    expect(result.refundAmount).toBe(10000);
  });
});
