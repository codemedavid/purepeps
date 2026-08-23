/**
 * What should happen when an admin confirms an order.
 *
 * Pure decision logic, split out of OrdersManager so the rules can be tested
 * without React or Supabase — the same shape as orderTracking.ts.
 *
 * WHY THIS EXISTS: confirming used to write `order_status: 'confirmed'` AND
 * `payment_status: 'paid'` unconditionally. With COD and explicit failure states
 * that is wrong in two directions:
 *
 *   - A COD order has NOT been paid when it is confirmed. Marking it paid tells
 *     the customer (and the waybill) that money already changed hands.
 *   - A Pay Now order whose payment FAILED would be silently relabelled as paid,
 *     erasing the failure and letting it count toward confirmed demand.
 *
 * So a confirmation now falls into one of three cases:
 *
 *   1. Payment is sound and unverified (pending/submitted Pay Now) — confirming
 *      IS the verification. Mark it paid.
 *   2. Payment needs no action (already paid, or COD which is unpaid by design)
 *      — advance the order only, leave payment_status alone.
 *   3. Payment is in a bad state (failed/refunded/partially refunded) — allowed,
 *      but only behind an explicit override, and recorded as a MANUAL decision
 *      via manually_confirmed_at rather than disguised as a payment.
 */

/** Payment states where confirming means overriding a known-bad payment. */
const OVERRIDE_STATUSES: readonly string[] = ['failed', 'refunded', 'partially_refunded'];

/** Pay Now states that confirming legitimately settles as paid. */
const VERIFIABLE_STATUSES: readonly string[] = ['pending', 'submitted'];

export interface ConfirmableOrderInput {
  readonly payment_type?: string | null;
  readonly payment_status?: string | null;
  readonly order_status?: string | null;
}

export interface ConfirmationUpdates {
  order_status: 'confirmed';
  payment_status?: string;
  manually_confirmed_at?: string;
  manually_confirmed_by?: string;
}

export interface ConfirmationPlan {
  /** True when the admin must explicitly acknowledge a bad payment first. */
  readonly requiresOverride: boolean;
  /** Text for that acknowledgement, or null when none is needed. */
  readonly warning: string | null;
  /** Exactly the columns to write. Absent keys are deliberately left untouched. */
  readonly updates: ConfirmationUpdates;
}

const OVERRIDE_WARNINGS: Readonly<Record<string, string>> = {
  failed: "This order's payment has FAILED.",
  refunded: 'This order has been REFUNDED.',
  partially_refunded: 'This order has been PARTIALLY REFUNDED.',
};

export function planOrderConfirmation(
  order: ConfirmableOrderInput,
  opts: { now: string; adminEmail?: string | null },
): ConfirmationPlan {
  // Orders predating the Pay Now / COD split were all prepaid with a receipt.
  const paymentType = order.payment_type ?? 'pay_now';
  const paymentStatus = order.payment_status ?? 'pending';

  const updates: ConfirmationUpdates = { order_status: 'confirmed' };

  if (OVERRIDE_STATUSES.includes(paymentStatus)) {
    // Record who accepted the risk. payment_status is deliberately NOT touched:
    // the payment really did fail, and pretending otherwise loses the fact.
    updates.manually_confirmed_at = opts.now;
    updates.manually_confirmed_by = opts.adminEmail?.trim() || 'admin';

    return {
      requiresOverride: true,
      warning: `${OVERRIDE_WARNINGS[paymentStatus]} Confirming it anyway will count it as a confirmed order and reserve stock. This will be recorded against your account.`,
      updates,
    };
  }

  // COD is unpaid until the courier collects, so confirming settles nothing.
  if (paymentType === 'pay_now' && VERIFIABLE_STATUSES.includes(paymentStatus)) {
    updates.payment_status = 'paid';
  }

  return { requiresOverride: false, warning: null, updates };
}
