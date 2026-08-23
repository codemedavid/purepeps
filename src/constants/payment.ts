/**
 * Pure payment vocabulary shared by checkout, the customer tracking page, the
 * admin orders manager, the group-buy panels and the waybill. Side-effect free
 * (no React, no Supabase) so the rules can be unit tested directly.
 *
 * Two columns drive everything:
 *   - orders.payment_type   — how the customer chose to pay ('pay_now' | 'cod').
 *   - orders.payment_status — where that payment currently stands.
 *
 * The stored token for "Pending Payment" is `pending`, NOT `pending_payment`.
 * Renaming it would break the anon INSERT policy (20260621000000, which asserts
 * payment_status = 'pending') and submit_additional_payment (20260708000000).
 * The business label lives here instead, so the wording can change freely while
 * the token stays stable.
 */

export type PaymentType = 'pay_now' | 'cod';

export type PaymentStatus =
  | 'pending'
  | 'submitted'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

/** Order statuses that mean the order is not (or no longer) a live commitment. */
const UNCONFIRMED_ORDER_STATUSES: readonly string[] = ['new', 'cancelled'];

const PAYMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  pay_now: 'Pay Now',
  cod: 'Cash on Delivery',
};

const PAYMENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: 'Pending Payment',
  submitted: 'Payment Submitted',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partially Refunded',
};

const PAYMENT_STATUS_COLORS: Readonly<Record<string, string>> = {
  pending: 'bg-gold-100 text-gold-700 border-gold-300',
  submitted: 'bg-blue-100 text-blue-800 border-blue-300',
  paid: 'bg-green-100 text-green-700 border-green-300',
  failed: 'bg-red-100 text-red-700 border-red-300',
  refunded: 'bg-slate-100 text-slate-700 border-slate-300',
  partially_refunded: 'bg-amber-100 text-amber-800 border-amber-300',
};

const NEUTRAL_STATUS_COLOR = 'bg-gray-100 text-gray-700 border-gray-300';

/**
 * Payment statuses an admin may set by hand.
 *
 * `submitted` is deliberately absent: it is written only by the customer-facing
 * submit_additional_payment RPC to mean "receipt uploaded, awaiting review". An
 * admin reviewing that receipt moves it to paid or failed, never back.
 */
export const PAY_NOW_STATUS_OPTIONS: readonly { value: PaymentStatus; label: string }[] = [
  { value: 'pending', label: 'Pending Payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'partially_refunded', label: 'Partially Refunded' },
];

/** COD never passes through proof review, so it skips `submitted` entirely. */
export const COD_STATUS_OPTIONS: readonly { value: PaymentStatus; label: string }[] = [
  { value: 'pending', label: 'Collect on Delivery' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'partially_refunded', label: 'Partially Refunded' },
];

export function paymentTypeLabel(type: string | null | undefined): string {
  if (!type) return '—';
  return PAYMENT_TYPE_LABELS[type] ?? type;
}

/**
 * Human label for a payment status, read in the context of how the customer
 * chose to pay. A pending COD order is not chasing money — nothing is owed
 * until the courier arrives — so it reads "Collect on Delivery" instead of
 * "Pending Payment". Unknown tokens pass through rather than being hidden.
 */
export function paymentStatusLabel(
  status: string | null | undefined,
  type?: string | null,
): string {
  if (!status) return '—';
  if (type === 'cod' && status === 'pending') return 'Collect on Delivery';
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

export function paymentStatusColor(status: string | null | undefined): string {
  if (!status) return NEUTRAL_STATUS_COLOR;
  return PAYMENT_STATUS_COLORS[status] ?? NEUTRAL_STATUS_COLOR;
}

/** Pay Now requires a receipt at checkout; COD has nothing to prove yet. */
export function isProofRequired(type: string | null | undefined): boolean {
  return type === 'pay_now';
}

export interface OrderMoney {
  readonly total_price?: number | null;
  readonly shipping_fee?: number | null;
}

/**
 * Cash the courier collects for a COD order.
 *
 * There is no COD surcharge (product decision): the customer pays exactly what
 * a Pay Now customer would. total_price already carries the promo discount and
 * excludes shipping, so shipping is added back here.
 */
export function codAmountDue(order: OrderMoney): number {
  return Number(order.total_price ?? 0) + Number(order.shipping_fee ?? 0);
}

export interface ConfirmableOrder {
  readonly order_status?: string | null;
  readonly payment_type?: string | null;
  readonly payment_status?: string | null;
  readonly manually_confirmed_at?: string | null;
}

/**
 * Whether an order counts as a CONFIRMED order — for admin KPIs, group-buy cap
 * maths and demand totals.
 *
 * Client mirror of the confirmed_quantity predicate in get_group_buy_progress.
 * The database is authoritative; this exists so the admin UI never shows a count
 * that disagrees with what the caps actually enforce. Keep the two in step.
 *
 * A Pay Now order that failed or was never paid does NOT count, no matter what
 * its order_status says — unless an admin explicitly took responsibility for it,
 * which is recorded as manually_confirmed_at. A COD order is unpaid by design,
 * so confirming it is itself the admin accepting that risk.
 */
export function countsAsConfirmedOrder(order: ConfirmableOrder): boolean {
  const orderStatus = order.order_status;
  if (!orderStatus || UNCONFIRMED_ORDER_STATUSES.includes(orderStatus)) return false;

  return (
    order.payment_type === 'cod' ||
    order.payment_status === 'paid' ||
    order.manually_confirmed_at != null
  );
}

/**
 * Derive the refund status implied by an amount refunded, or null when nothing
 * has been refunded and the caller should leave the current status alone.
 *
 * An over-refund (goodwill, shipping returned on top) settles as a full refund
 * rather than an impossible fourth state.
 */
export function resolveRefundStatus(
  totalDue: number,
  refundedTotal: number | null | undefined,
): PaymentStatus | null {
  const refunded = Number(refundedTotal ?? 0);
  if (refunded <= 0) return null;
  return refunded >= totalDue ? 'refunded' : 'partially_refunded';
}
