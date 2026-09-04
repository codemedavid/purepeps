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

/** Payment states where money did not stay with us, so the order is not demand. */
const SETTLED_AGAINST_STATUSES: readonly string[] = ['failed', 'refunded', 'partially_refunded'];

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

/**
 * COD statuses. `pending` reads as "Collect on Delivery" because what is
 * outstanding is the shipping fee the courier will take, not the order.
 */
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

/**
 * Whether checkout must collect a receipt.
 *
 * TRUE for both options. The payment choice governs the SHIPPING FEE only —
 * the items themselves are bought online either way — so every storefront
 * order arrives with a receipt to review. Kept as a named rule rather than a
 * bare `true` so the reason survives, and so a future third option (invoice,
 * on-account) has one place to say otherwise.
 */
export function isProofRequired(type: string | null | undefined): boolean {
  return type === 'pay_now' || type === 'cod';
}

export interface OrderMoney {
  readonly total_price?: number | null;
  readonly shipping_fee?: number | null;
}

/**
 * Cash the courier collects for a COD order: the SHIPPING FEE, and nothing else.
 *
 * Cash on Delivery here means "pay the shipping fee on delivery", NOT "pay for
 * the order on delivery". A COD shopper still buys the items online at checkout
 * and uploads a receipt for them, exactly like a Pay Now shopper — the only
 * difference is that the fee travels with the parcel instead of the payment.
 *
 * So this must never reach for total_price. Adding it back would tell a courier
 * to collect the item price a SECOND time, from someone who has already paid it.
 *
 * There is no COD surcharge (product decision): the fee is the same either way.
 */
export function codAmountDue(order: OrderMoney): number {
  return Number(order.shipping_fee ?? 0);
}

/**
 * What the shopper pays ONLINE at checkout, given the option they picked.
 *
 * Pay Now settles the shipping fee up front, so it bills items + shipping in a
 * single transfer. COD bills the items alone and leaves the fee for the courier.
 * Together with codAmountDue these two always sum to the same grand total — the
 * option moves the fee between them, it never changes what is owed.
 */
export function onlinePaymentDue(order: OrderMoney, type: PaymentType): number {
  const items = Number(order.total_price ?? 0);
  return type === 'pay_now' ? items + Number(order.shipping_fee ?? 0) : items;
}

/**
 * Everything the order is worth, however it was split across the two moments.
 *
 * This — not codAmountDue — is the figure a refund is measured against. The two
 * were the same number under the old "COD pays for everything" model, and a
 * refund path that still reaches for codAmountDue would now quietly offer to
 * return the shipping fee instead of the order.
 */
export function orderGrandTotal(order: OrderMoney): number {
  return Number(order.total_price ?? 0) + Number(order.shipping_fee ?? 0);
}

export interface ConfirmableOrder {
  readonly order_status?: string | null;
  readonly payment_type?: string | null;
  readonly payment_status?: string | null;
  readonly manually_confirmed_at?: string | null;
  /** Confirmed received. Distinguishes a reviewed balance receipt from an unpaid one. */
  readonly paid_total?: number | null;
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

  // An explicit admin decision outranks the payment state, whatever it is.
  if (order.manually_confirmed_at != null) return true;

  // A payment that failed or was handed back is not demand — for COD just as
  // much as for Pay Now. A refused COD delivery must release its cap slot,
  // otherwise the only way to free it is cancelling, which erases the record.
  if (SETTLED_AGAINST_STATUSES.includes(order.payment_status ?? '')) return false;

  // A balance receipt under review on an order that WAS paid.
  // submit_additional_payment moves such an order to 'submitted', and dropping
  // it out of confirmed demand would silently free a cap slot the customer has
  // already paid for. Mirrors the matching OR-branch in the SQL filter.
  if (order.payment_status === 'submitted' && order.paid_total != null) return true;

  // COD is legitimately unpaid until the courier collects.
  return order.payment_type === 'cod' || order.payment_status === 'paid';
}

export interface CollectibleOrder {
  readonly order_status?: string | null;
  readonly payment_type?: string | null;
  readonly payment_status?: string | null;
}

/**
 * Whether a courier should still collect cash for this order.
 *
 * Drives the waybill COLLECT ON DELIVERY banner and the closeout CSV's
 * "COD to collect" column, so a false positive tells someone to take money that
 * is not owed. Requires all three: it is COD, the cash has not already been
 * remitted, and the order has not been cancelled or settled against us.
 */
export function isCodCollectible(order: CollectibleOrder): boolean {
  if (order.payment_type !== 'cod') return false;
  if (order.payment_status === 'paid') return false;
  if (SETTLED_AGAINST_STATUSES.includes(order.payment_status ?? '')) return false;
  return order.order_status !== 'cancelled';
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
