import {
  codAmountDue,
  onlinePaymentDue,
  orderGrandTotal,
  paymentStatusLabel,
  type PaymentType,
} from '../constants/payment';
import { fulfillmentStageLabel, orderStatusLabel } from './orderTracking';
import type { OrderHistoryLineItem, OrderHistoryRow } from '../types';

/**
 * Pure derivations behind the customer-facing Order History. Side-effect free
 * (no React, no Supabase) so every money rule and timeline rule can be unit
 * tested directly, in the same spirit as orderTracking.ts.
 *
 * Money is NOT recomputed here. codAmountDue / onlinePaymentDue / orderGrandTotal
 * in constants/payment.ts are the single source of truth for how the Pay Now vs
 * COD split works, and this module composes them rather than restating them —
 * a second copy of that rule is exactly how the shipping fee ends up being
 * collected twice.
 */

/** The column default when payment_type predates the payment-option split. */
const DEFAULT_PAYMENT_TYPE: PaymentType = 'pay_now';

function toPaymentType(value: string | null | undefined): PaymentType {
  return value === 'cod' ? 'cod' : DEFAULT_PAYMENT_TYPE;
}

export interface OrderCharges {
  /** Sum of the line items as stored, before any discount. */
  readonly itemsTotal: number;
  /** Items before discount, derived — see deriveCharges. */
  readonly subtotal: number;
  readonly discount: number;
  readonly shippingFee: number;
  /** Everything the order is worth, however it is split across the two moments. */
  readonly grandTotal: number;
  /** Settled online at checkout. */
  readonly payableOnline: number;
  /** Handed to the courier — the shipping fee on a COD order, otherwise nothing. */
  readonly payableOnDelivery: number;
  readonly balanceDue: number;
  readonly refunded: number;
}

/**
 * The full money breakdown for one order.
 *
 * SUBTOTAL IS DERIVED, NOT READ. The orders table has a `subtotal` column, but
 * regular checkout never writes it — only claim_group_buy_leftover does — so it
 * is NULL on almost every real order. What checkout does store is
 * total_price = subtotal - discount, excluding shipping. Adding the discount back
 * recovers the subtotal for every order, old and new.
 *
 * itemsTotal is kept alongside as an independent read of the same figure (the sum
 * of the line items), so a caller can show the two and spot a stored total that
 * has drifted from the items an admin later edited.
 */
export function deriveCharges(row: OrderHistoryRow): OrderCharges {
  const discount = Number(row.discount_applied ?? 0);
  const storedItems = Number(row.total_price ?? 0);
  const shippingFee = Number(row.shipping_fee ?? 0);
  const type = toPaymentType(row.payment_type);

  return {
    itemsTotal: row.order_items.reduce((sum, item) => sum + Number(item.total ?? 0), 0),
    subtotal: storedItems + discount,
    discount,
    shippingFee,
    grandTotal: orderGrandTotal(row),
    payableOnline: onlinePaymentDue(row, type),
    payableOnDelivery: type === 'cod' ? codAmountDue(row) : 0,
    balanceDue: Number(row.balance_due ?? 0),
    refunded: Number(row.refunded_total ?? 0),
  };
}

/** The exact strength of a line item, e.g. "10 mg" — null when unrecoverable. */
export function strengthLabel(item: OrderHistoryLineItem): string | null {
  const mg = item.quantity_mg;
  if (mg == null || Number.isNaN(Number(mg))) return null;
  // Number() drops a trailing .0 so 10 reads "10 mg" while 2.5 stays exact.
  return `${Number(mg)} mg`;
}

/**
 * How a line item's variation should read: its name, its exact strength, or both.
 *
 * Variation names in this catalog usually already ARE the strength ("10mg"), so
 * naively appending the recovered milligrams would print "10mg · 10 mg". When the
 * name already states the same number followed by mg, the name stands alone.
 */
export function describeVariation(item: OrderHistoryLineItem): string | null {
  const name = item.variation_name?.trim() || null;
  const strength = strengthLabel(item);

  if (!name) return strength;
  if (!strength) return name;

  const mg = Number(item.quantity_mg);
  const alreadyStated = new RegExp(`(^|[^\\d.])${mg}\\s*mg\\b`, 'i').test(name);
  return alreadyStated ? name : `${name} · ${strength}`;
}

/** "Batch 7 · March Run" — null when the order belongs to no group buy. */
export function batchLabel(row: OrderHistoryRow): string | null {
  if (!row.group_buy_batch_id && row.batch_number == null) return null;
  if (row.batch_number == null) return row.batch_name?.trim() || null;

  const numbered = `Batch ${row.batch_number}`;
  const name = row.batch_name?.trim();
  return name ? `${numbered} · ${name}` : numbered;
}

export type TimelineKind = 'placed' | 'order_status' | 'payment_status' | 'fulfillment_stage';

export interface TimelineEntry {
  readonly key: string;
  readonly kind: TimelineKind;
  readonly label: string;
  /** Where it came from, when that is known and worth saying. */
  readonly detail: string | null;
  readonly occurredAt: string;
}

function entryLabel(
  kind: TimelineKind,
  value: string | null,
  paymentType: string | null,
): string {
  switch (kind) {
    case 'placed':
      return 'Order placed';
    case 'order_status':
      return orderStatusLabel(value);
    case 'payment_status':
      // Read in context: a pending COD payment is not chasing money.
      return paymentStatusLabel(value, paymentType);
    case 'fulfillment_stage':
      return fulfillmentStageLabel(value);
  }
}

/**
 * One chronological timeline for an order, oldest first.
 *
 * Two sources are merged: the order's own recorded transitions, and the shared
 * international-leg stages of the batch it rides in — the same two legs
 * computeTrackingStep merges to decide the CURRENT step, read here as history.
 *
 * Two rules keep it honest:
 *   - A 'placed' entry is synthesized from created_at when none was recorded, so
 *     every order starts somewhere. If the database has one, that one is used.
 *   - A batch stage recorded BEFORE this order existed did not happen to this
 *     order — it belongs to the batch's earlier life — so it is dropped.
 */
export function buildStatusTimeline(row: OrderHistoryRow): TimelineEntry[] {
  const events = row.status_events ?? [];
  const placedAt = new Date(row.created_at).getTime();

  const entries: TimelineEntry[] = events
    .filter((event) => {
      if (event.event_type !== 'fulfillment_stage') return true;
      return new Date(event.occurred_at).getTime() >= placedAt;
    })
    .map((event, index) => ({
      key: `${event.event_type}-${event.occurred_at}-${index}`,
      kind: event.event_type,
      label: entryLabel(event.event_type, event.to_value, row.payment_type),
      detail:
        event.from_value && event.event_type !== 'placed'
          ? `Changed from ${entryLabel(event.event_type, event.from_value, row.payment_type)}`
          : null,
      occurredAt: event.occurred_at,
    }));

  if (!entries.some((entry) => entry.kind === 'placed')) {
    entries.push({
      key: `placed-${row.created_at}`,
      kind: 'placed',
      label: 'Order placed',
      detail: null,
      occurredAt: row.created_at,
    });
  }

  return entries.sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
}

/**
 * Whether this order's history is known to be incomplete.
 *
 * True for orders placed before the events log existed: they have moved past
 * their initial state, yet no transition was ever recorded. The UI says so
 * rather than showing a one-entry timeline that implies nothing has happened.
 */
export function isTimelinePartial(row: OrderHistoryRow): boolean {
  const recorded = (row.status_events ?? []).filter((event) => event.event_type !== 'placed');
  if (recorded.length > 0) return false;

  const movedOn = (row.order_status ?? 'new') !== 'new' || row.payment_status !== 'pending';
  return movedOn;
}
