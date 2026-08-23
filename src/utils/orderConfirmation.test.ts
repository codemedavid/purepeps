import { describe, it, expect } from 'vitest';
import { planOrderConfirmation } from './orderConfirmation';

const NOW = '2026-08-24T10:00:00.000Z';
const ADMIN = 'admin@purepeps.test';
const opts = { now: NOW, adminEmail: ADMIN };

const payNow = (payment_status: string) => ({
  payment_type: 'pay_now',
  payment_status,
  order_status: 'new',
});

describe('planOrderConfirmation — Pay Now, payment verified', () => {
  it('marks a pending Pay Now order paid when the admin confirms it', () => {
    // The everyday flow: admin eyeballs the uploaded receipt, hits Confirm.
    const plan = planOrderConfirmation(payNow('pending'), opts);

    expect(plan.requiresOverride).toBe(false);
    expect(plan.warning).toBeNull();
    expect(plan.updates.order_status).toBe('confirmed');
    expect(plan.updates.payment_status).toBe('paid');
  });

  it('treats a submitted receipt the same as a pending one', () => {
    const plan = planOrderConfirmation(payNow('submitted'), opts);

    expect(plan.requiresOverride).toBe(false);
    expect(plan.updates.payment_status).toBe('paid');
  });

  it('does not rewrite the payment status of an already-paid order', () => {
    const plan = planOrderConfirmation(payNow('paid'), opts);

    expect(plan.requiresOverride).toBe(false);
    expect(plan.updates.order_status).toBe('confirmed');
    expect(plan.updates.payment_status).toBeUndefined();
  });

  it('never stamps a manual confirmation when the payment is sound', () => {
    expect(planOrderConfirmation(payNow('paid'), opts).updates.manually_confirmed_at).toBeUndefined();
    expect(planOrderConfirmation(payNow('pending'), opts).updates.manually_confirmed_at).toBeUndefined();
  });
});

describe('planOrderConfirmation — Pay Now, payment NOT sound', () => {
  it('requires an explicit override to confirm a FAILED payment', () => {
    const plan = planOrderConfirmation(payNow('failed'), opts);

    expect(plan.requiresOverride).toBe(true);
    expect(plan.warning).toMatch(/failed/i);
  });

  it('refuses to call a failed payment paid, and records who took the risk', () => {
    // The heart of the requirement: confirming a failed order is allowed, but it
    // is recorded as a manual decision rather than disguised as a payment.
    const plan = planOrderConfirmation(payNow('failed'), opts);

    expect(plan.updates.payment_status).toBeUndefined();
    expect(plan.updates.manually_confirmed_at).toBe(NOW);
    expect(plan.updates.manually_confirmed_by).toBe(ADMIN);
  });

  it('requires an override to confirm a refunded order', () => {
    const plan = planOrderConfirmation(payNow('refunded'), opts);

    expect(plan.requiresOverride).toBe(true);
    expect(plan.warning).toMatch(/refund/i);
    expect(plan.updates.payment_status).toBeUndefined();
    expect(plan.updates.manually_confirmed_at).toBe(NOW);
  });

  it('requires an override to confirm a partially refunded order', () => {
    const plan = planOrderConfirmation(payNow('partially_refunded'), opts);

    expect(plan.requiresOverride).toBe(true);
    expect(plan.updates.manually_confirmed_at).toBe(NOW);
  });
});

describe('planOrderConfirmation — Cash on Delivery', () => {
  const cod = (payment_status = 'pending') => ({
    payment_type: 'cod',
    payment_status,
    order_status: 'new',
  });

  it('confirms without an override — COD is unpaid by design', () => {
    const plan = planOrderConfirmation(cod(), opts);

    expect(plan.requiresOverride).toBe(false);
    expect(plan.warning).toBeNull();
    expect(plan.updates.order_status).toBe('confirmed');
  });

  it('does NOT mark a COD order paid — the courier has not collected yet', () => {
    // The old code set payment_status:'paid' on every confirm. For COD that is a
    // lie that would show the customer as having paid before delivery.
    const plan = planOrderConfirmation(cod(), opts);

    expect(plan.updates.payment_status).toBeUndefined();
  });

  it('does not stamp a manual confirmation for COD', () => {
    // COD already counts as confirmed in its own right, so no override is implied.
    const plan = planOrderConfirmation(cod(), opts).updates;

    expect(plan.manually_confirmed_at).toBeUndefined();
    expect(plan.manually_confirmed_by).toBeUndefined();
  });

  it('still requires an override to confirm a refunded COD order', () => {
    const plan = planOrderConfirmation(cod('refunded'), opts);

    expect(plan.requiresOverride).toBe(true);
    expect(plan.updates.manually_confirmed_at).toBe(NOW);
  });
});

describe('planOrderConfirmation — legacy rows', () => {
  it('treats an order with no payment_type as Pay Now', () => {
    // Every order predating this feature was prepaid with a receipt.
    const plan = planOrderConfirmation(
      { payment_type: null, payment_status: 'pending', order_status: 'new' },
      opts,
    );

    expect(plan.requiresOverride).toBe(false);
    expect(plan.updates.payment_status).toBe('paid');
  });

  it('falls back to a usable admin identity when the email is unknown', () => {
    const plan = planOrderConfirmation(payNow('failed'), { now: NOW, adminEmail: null });

    expect(plan.updates.manually_confirmed_by).toBe('admin');
  });
});
