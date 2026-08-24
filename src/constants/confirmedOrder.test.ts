import { describe, it, expect } from 'vitest';
import { countsAsConfirmedOrder } from './payment';

/**
 * countsAsConfirmedOrder documents itself as a client mirror of the
 * confirmed_quantity FILTER in get_group_buy_progress ("The database is
 * authoritative ... Keep the two in step"). These cases pin the mirror to the
 * SQL as it actually stands in 20260824000150_confirmed_orders_payment_aware.
 *
 * Ligwak allocation depends on this agreeing: the admin previews with the TS
 * predicate and the database locks with the SQL one. Any divergence moves a
 * customer in or out of the incomplete kit between preview and lock.
 */
describe('countsAsConfirmedOrder mirrors the SQL confirmed_quantity filter', () => {
  it('counts a paid Pay Now order', () => {
    expect(
      countsAsConfirmedOrder({
        order_status: 'confirmed',
        payment_type: 'pay_now',
        payment_status: 'paid',
      }),
    ).toBe(true);
  });

  // SQL: OR (o.payment_status = 'submitted' AND o.paid_total IS NOT NULL).
  // submit_additional_payment moves an already-paid order to 'submitted' when a
  // balance receipt is uploaded. That must not silently drop it out of demand.
  it('counts an already-paid order whose balance receipt is under review', () => {
    expect(
      countsAsConfirmedOrder({
        order_status: 'confirmed',
        payment_type: 'pay_now',
        payment_status: 'submitted',
        paid_total: 5000,
      }),
    ).toBe(true);
  });

  it('does not count a submitted order that was never paid', () => {
    expect(
      countsAsConfirmedOrder({
        order_status: 'confirmed',
        payment_type: 'pay_now',
        payment_status: 'submitted',
        paid_total: null,
      }),
    ).toBe(false);
  });

  it('does not count an unpaid Pay Now order', () => {
    expect(
      countsAsConfirmedOrder({
        order_status: 'confirmed',
        payment_type: 'pay_now',
        payment_status: 'pending',
      }),
    ).toBe(false);
  });

  it('counts an unpaid COD order', () => {
    expect(
      countsAsConfirmedOrder({
        order_status: 'confirmed',
        payment_type: 'cod',
        payment_status: 'pending',
      }),
    ).toBe(true);
  });

  it('does not count cancelled or unconfirmed orders whatever the payment says', () => {
    expect(
      countsAsConfirmedOrder({
        order_status: 'cancelled',
        payment_type: 'pay_now',
        payment_status: 'paid',
      }),
    ).toBe(false);
    expect(
      countsAsConfirmedOrder({
        order_status: 'new',
        payment_type: 'pay_now',
        payment_status: 'paid',
      }),
    ).toBe(false);
  });

  it('does not count a payment settled against us', () => {
    for (const payment_status of ['failed', 'refunded', 'partially_refunded']) {
      expect(
        countsAsConfirmedOrder({
          order_status: 'confirmed',
          payment_type: 'cod',
          payment_status,
        }),
      ).toBe(false);
    }
  });

  it('lets an explicit admin confirmation outrank the payment state', () => {
    expect(
      countsAsConfirmedOrder({
        order_status: 'confirmed',
        payment_type: 'pay_now',
        payment_status: 'pending',
        manually_confirmed_at: '2026-08-01T00:00:00Z',
      }),
    ).toBe(true);
  });
});
