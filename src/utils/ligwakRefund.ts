import type { LigwakRefundStatus } from '../constants/ligwak';

/**
 * What a ligwak customer is owed, measured against what they ACTUALLY paid.
 *
 * Side-effect free so the money rule can be unit tested on its own.
 *
 * Three facts about how this codebase stores order money drive everything here:
 *
 *   * `total_price` is the items total AFTER the promo discount; `subtotal` is
 *     the same figure before it. Refunding line price x quantity would hand back
 *     money a discounted customer never paid, so the discount is prorated onto
 *     the refunded vials via total_price / subtotal.
 *
 *   * `shipping_fee` is stored separately and is NOT part of total_price.
 *
 *   * `paid_total` is what was actually confirmed received. It is the ceiling:
 *     a refund may never exceed it, minus anything already refunded.
 *
 * And one product rule: Cash on Delivery covers the SHIPPING FEE only. COD
 * customers buy their vials online at checkout with a receipt, exactly like Pay
 * Now customers. A COD ligwak customer is therefore owed a refund for their
 * vials — only the shipping fee, which the courier never collected, is not.
 */

export interface LigwakRefundOrderMoney {
  /** Items total BEFORE the promo discount. Null on rows predating the column. */
  readonly subtotal?: number | null;
  /** Items total AFTER the promo discount. Excludes shipping. */
  readonly total_price?: number | null;
  readonly shipping_fee?: number | null;
  /** Confirmed received. Null means never confirmed paid. */
  readonly paid_total?: number | null;
  readonly refunded_total?: number | null;
  readonly payment_type?: string | null;
  readonly payment_status?: string | null;
}

export interface LigwakRefundInput {
  readonly order: LigwakRefundOrderMoney;
  /** Per-vial price stored on the order line. */
  readonly linePrice: number;
  /** Vials of this line on the order. */
  readonly lineQuantity: number;
  /** How many of them fell outside a complete kit. */
  readonly ligwakQty: number;
  /**
   * True when every vial on the whole order is ligwak. Nothing ships, so a
   * shipping fee the customer already paid comes back as well.
   */
  readonly isEntireOrderLigwak: boolean;
  /**
   * Refund money still available on this ORDER, when the caller is walking
   * several ligwak lines of the same order.
   *
   * paid_total is a property of the order, not of a line, so sibling lines draw
   * from ONE pot. Left undefined for a single-line calculation, where the pot is
   * simply paid_total - refunded_total.
   */
  readonly headroomRemaining?: number;
}

export interface LigwakRefundResult {
  /** Total owed: the vials, plus shipping when the whole order is ligwak. */
  readonly refundAmount: number;
  /** The shipping portion of refundAmount, broken out for the admin. */
  readonly shippingRefunded: number;
  readonly refundStatus: LigwakRefundStatus;
}

/** Money is settled in centavos; carrying binary float error into a refund is not honest. */
function toCentavos(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The fraction of list price the customer actually paid, after the order-level
 * promo discount. Falls back to 1 for legacy rows with no subtotal (there is no
 * discount to prorate) and guards a zero subtotal from dividing.
 */
function paidRatio(order: LigwakRefundOrderMoney): number {
  const subtotal = Number(order.subtotal ?? 0);
  const total = Number(order.total_price ?? 0);
  if (subtotal <= 0) return 1;
  return total / subtotal;
}

/**
 * Whether the customer has already handed over the shipping fee.
 *
 * Pay Now settles the fee online at checkout, so it is refundable. COD leaves it
 * with the courier — if the parcel never ships, the fee is simply never
 * collected, and "refunding" it would pay out money that never arrived.
 */
function hasPrepaidShipping(order: LigwakRefundOrderMoney): boolean {
  return order.payment_type !== 'cod';
}

/**
 * Work out the refund owed for one order line's ligwak vials.
 *
 * Returns `no_refund_required` only when the arithmetic says nothing is owed —
 * never because of how the customer chose to pay. That distinction is the whole
 * point: keying it off payment_type would silently keep the money of every COD
 * customer who had already paid for their vials online.
 */
export function computeLigwakRefund(input: LigwakRefundInput): LigwakRefundResult {
  const { order, linePrice, lineQuantity, ligwakQty, isEntireOrderLigwak } = input;

  const perVialPaid = Math.max(0, Number(linePrice) || 0) * paidRatio(order);
  const vialsRefund = perVialPaid * Math.max(0, Math.min(ligwakQty, lineQuantity));

  const shippingOwed =
    isEntireOrderLigwak && hasPrepaidShipping(order)
      ? Math.max(0, Number(order.shipping_fee ?? 0))
      : 0;

  // Ceiling: money that never reached us cannot be sent back, and money already
  // returned must not be returned twice. When the caller is walking several
  // ligwak lines of one order it passes the pot that is actually LEFT, since
  // every line of that order spends from the same paid_total.
  const received = Math.max(0, Number(order.paid_total ?? 0));
  const alreadyRefunded = Math.max(0, Number(order.refunded_total ?? 0));
  const headroom =
    input.headroomRemaining != null
      ? Math.max(0, input.headroomRemaining)
      : Math.max(0, received - alreadyRefunded);

  const requested = vialsRefund + shippingOwed;
  const refundAmount = toCentavos(Math.min(requested, headroom));
  // The vials are settled before shipping, so a clipped refund reduces the
  // shipping portion first rather than overstating what was returned.
  const shippingRefunded = toCentavos(Math.max(0, refundAmount - toCentavos(vialsRefund)));

  return {
    refundAmount,
    shippingRefunded,
    refundStatus: refundAmount > 0 ? 'for_review' : 'no_refund_required',
  };
}
