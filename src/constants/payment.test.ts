import { describe, it, expect } from 'vitest';
import {
  PAY_NOW_STATUS_OPTIONS,
  COD_STATUS_OPTIONS,
  codAmountDue,
  countsAsConfirmedOrder,
  isCodCollectible,
  isProofRequired,
  paymentStatusColor,
  paymentStatusLabel,
  paymentTypeLabel,
  resolveRefundStatus,
} from './payment';

describe('paymentTypeLabel', () => {
  it('labels an online order as Pay Now', () => {
    expect(paymentTypeLabel('pay_now')).toBe('Pay Now');
  });

  it('labels a cash order as Cash on Delivery', () => {
    expect(paymentTypeLabel('cod')).toBe('Cash on Delivery');
  });

  it('falls back to an em dash when the type is missing', () => {
    expect(paymentTypeLabel(null)).toBe('—');
    expect(paymentTypeLabel(undefined)).toBe('—');
  });

  it('passes an unknown type through rather than hiding it', () => {
    // Mirrors orderStatusLabel: never silently swallow an unexpected value.
    expect(paymentTypeLabel('crypto')).toBe('crypto');
  });
});

describe('paymentStatusLabel', () => {
  it('renders the five Pay Now statuses with their business labels', () => {
    expect(paymentStatusLabel('pending', 'pay_now')).toBe('Pending Payment');
    expect(paymentStatusLabel('paid', 'pay_now')).toBe('Paid');
    expect(paymentStatusLabel('failed', 'pay_now')).toBe('Failed');
    expect(paymentStatusLabel('refunded', 'pay_now')).toBe('Refunded');
    expect(paymentStatusLabel('partially_refunded', 'pay_now')).toBe('Partially Refunded');
  });

  it('keeps the legacy submitted status visible as awaiting review', () => {
    // 'submitted' predates this feature (submit_additional_payment writes it)
    // and still exists in production rows, so it must stay legible.
    expect(paymentStatusLabel('submitted', 'pay_now')).toBe('Payment Submitted');
  });

  it('reframes a pending COD order as collect-on-delivery, not unpaid', () => {
    // A COD order is not "awaiting payment" in the Pay Now sense — nothing is
    // owed until the courier arrives, so the label must not read as chasing.
    expect(paymentStatusLabel('pending', 'cod')).toBe('Collect on Delivery');
  });

  it('shares the settled statuses across both payment types', () => {
    expect(paymentStatusLabel('paid', 'cod')).toBe('Paid');
    expect(paymentStatusLabel('refunded', 'cod')).toBe('Refunded');
  });

  it('falls back to an em dash when the status is missing', () => {
    expect(paymentStatusLabel(null, 'pay_now')).toBe('—');
  });

  it('passes an unknown status through rather than hiding it', () => {
    expect(paymentStatusLabel('chargeback', 'pay_now')).toBe('chargeback');
  });
});

describe('paymentStatusColor', () => {
  it('gives every known status its own badge classes', () => {
    const statuses = ['pending', 'submitted', 'paid', 'failed', 'refunded', 'partially_refunded'];
    const classes = statuses.map((s) => paymentStatusColor(s));
    expect(new Set(classes).size).toBe(statuses.length);
  });

  it('marks a paid order green and a failed order red', () => {
    expect(paymentStatusColor('paid')).toContain('green');
    expect(paymentStatusColor('failed')).toContain('red');
  });

  it('falls back to neutral classes for an unknown status', () => {
    expect(paymentStatusColor('chargeback')).toContain('gray');
  });
});

describe('status options by payment type', () => {
  it('offers the five required statuses for a Pay Now order', () => {
    const values = PAY_NOW_STATUS_OPTIONS.map((o) => o.value);
    expect(values).toEqual(
      expect.arrayContaining(['pending', 'paid', 'failed', 'refunded', 'partially_refunded']),
    );
  });

  it('does not offer submitted as a status an admin can pick', () => {
    // 'submitted' is written by the customer-facing RPC, never chosen by an admin.
    expect(PAY_NOW_STATUS_OPTIONS.map((o) => o.value)).not.toContain('submitted');
  });

  it('omits submitted from COD, which has no proof-upload step', () => {
    expect(COD_STATUS_OPTIONS.map((o) => o.value)).not.toContain('submitted');
  });
});

describe('isProofRequired', () => {
  it('requires proof of payment for a Pay Now order', () => {
    expect(isProofRequired('pay_now')).toBe(true);
  });

  it('does not require proof for a COD order', () => {
    expect(isProofRequired('cod')).toBe(false);
  });
});

describe('codAmountDue', () => {
  it('is the order total plus shipping, with no COD surcharge', () => {
    // Product decision: COD costs the customer exactly what Pay Now costs.
    expect(codAmountDue({ total_price: 2000, shipping_fee: 150 })).toBe(2150);
  });

  it('treats missing money fields as zero rather than NaN', () => {
    expect(codAmountDue({ total_price: 2000, shipping_fee: null })).toBe(2000);
    expect(codAmountDue({ total_price: null, shipping_fee: null })).toBe(0);
  });
});

describe('countsAsConfirmedOrder', () => {
  // Mirrors the confirmed_quantity predicate in get_group_buy_progress. The DB
  // is authoritative; this keeps admin KPIs from disagreeing with cap maths.
  const base = {
    order_status: 'confirmed',
    payment_type: 'pay_now' as const,
    payment_status: 'paid',
    manually_confirmed_at: null,
  };

  it('counts a confirmed, paid Pay Now order', () => {
    expect(countsAsConfirmedOrder(base)).toBe(true);
  });

  it('does not count an order still sitting at new', () => {
    expect(countsAsConfirmedOrder({ ...base, order_status: 'new' })).toBe(false);
  });

  it('does not count a cancelled order even when it was paid', () => {
    expect(countsAsConfirmedOrder({ ...base, order_status: 'cancelled' })).toBe(false);
  });

  it('does NOT count a Pay Now order whose payment failed', () => {
    // The headline requirement: a failed payment must not inflate confirmed counts.
    expect(countsAsConfirmedOrder({ ...base, payment_status: 'failed' })).toBe(false);
  });

  it('does NOT count a Pay Now order that was never paid', () => {
    expect(countsAsConfirmedOrder({ ...base, payment_status: 'pending' })).toBe(false);
  });

  it('counts a failed Pay Now order once an admin manually confirms it', () => {
    // The documented escape hatch — manual confirmation is what makes it count.
    expect(
      countsAsConfirmedOrder({
        ...base,
        payment_status: 'failed',
        manually_confirmed_at: '2026-08-24T00:00:00Z',
      }),
    ).toBe(true);
  });

  it('still refuses a manually confirmed order that was later cancelled', () => {
    expect(
      countsAsConfirmedOrder({
        ...base,
        order_status: 'cancelled',
        payment_status: 'failed',
        manually_confirmed_at: '2026-08-24T00:00:00Z',
      }),
    ).toBe(false);
  });

  it('counts a confirmed COD order that has not been paid yet', () => {
    // COD is unpaid by design until the courier collects; confirming it is the
    // admin accepting that risk, so it holds its group-buy slot.
    expect(
      countsAsConfirmedOrder({
        ...base,
        payment_type: 'cod',
        payment_status: 'pending',
      }),
    ).toBe(true);
  });

  it('does NOT count a COD order whose payment failed', () => {
    // Customer refused delivery, admin marked it Failed. Those units must stop
    // occupying a cap slot — otherwise only cancelling frees it, which destroys
    // the record of what happened.
    expect(
      countsAsConfirmedOrder({
        ...base,
        payment_type: 'cod',
        payment_status: 'failed',
      }),
    ).toBe(false);
  });

  it('does NOT count a refunded COD order', () => {
    expect(
      countsAsConfirmedOrder({ ...base, payment_type: 'cod', payment_status: 'refunded' }),
    ).toBe(false);
  });

  it('counts a failed COD order once an admin manually confirms it', () => {
    expect(
      countsAsConfirmedOrder({
        ...base,
        payment_type: 'cod',
        payment_status: 'failed',
        manually_confirmed_at: '2026-08-24T00:00:00Z',
      }),
    ).toBe(true);
  });

  it('does not count a COD order still sitting at new', () => {
    expect(
      countsAsConfirmedOrder({
        ...base,
        order_status: 'new',
        payment_type: 'cod',
        payment_status: 'pending',
      }),
    ).toBe(false);
  });
});

describe('isCodCollectible', () => {
  // Drives both the waybill COLLECT banner and the CSV "COD to collect" column.
  // A false positive here tells a courier to take money that is not owed.
  const cod = (over: Record<string, unknown> = {}) => ({
    payment_type: 'cod',
    payment_status: 'pending',
    order_status: 'confirmed',
    ...over,
  });

  it('is collectible for a confirmed, unpaid COD order', () => {
    expect(isCodCollectible(cod())).toBe(true);
  });

  it('is not collectible once the courier has remitted', () => {
    expect(isCodCollectible(cod({ payment_status: 'paid' }))).toBe(false);
  });

  it('is NOT collectible for a cancelled order', () => {
    // The members CSV deliberately lists cancelled rows; printing a concrete
    // amount against one invites collecting on an order that no longer exists.
    expect(isCodCollectible(cod({ order_status: 'cancelled' }))).toBe(false);
  });

  it('is NOT collectible once the payment failed or was refunded', () => {
    expect(isCodCollectible(cod({ payment_status: 'failed' }))).toBe(false);
    expect(isCodCollectible(cod({ payment_status: 'refunded' }))).toBe(false);
    expect(isCodCollectible(cod({ payment_status: 'partially_refunded' }))).toBe(false);
  });

  it('is never collectible for a Pay Now order', () => {
    expect(isCodCollectible(cod({ payment_type: 'pay_now' }))).toBe(false);
  });
});

describe('resolveRefundStatus', () => {
  it('reports a full refund when the whole total was returned', () => {
    expect(resolveRefundStatus(2150, 2150)).toBe('refunded');
  });

  it('reports a partial refund when only part was returned', () => {
    expect(resolveRefundStatus(2150, 500)).toBe('partially_refunded');
  });

  it('treats an over-refund as a full refund rather than an impossible state', () => {
    expect(resolveRefundStatus(2150, 3000)).toBe('refunded');
  });

  it('returns null when nothing was refunded, so the caller keeps the current status', () => {
    expect(resolveRefundStatus(2150, 0)).toBeNull();
    expect(resolveRefundStatus(2150, null)).toBeNull();
  });
});
