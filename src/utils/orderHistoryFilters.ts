import { paymentStatusLabel } from '../constants/payment';
import { orderStatusLabel } from './orderTracking';
import { batchLabel, describeVariation } from './orderHistory';
import type { OrderHistoryRow } from '../types';

/**
 * Pure search and filtering for the customer-facing Order History.
 *
 * SCOPE: these operate on the rows the customer already unlocked for themselves
 * (one email's own orders, or one bundle proved by order number + email). They
 * narrow a list that was already authorized — they are not an access control,
 * and no filter here should ever be the thing keeping one customer out of
 * another's data. That job belongs to the RPCs.
 *
 * Side-effect free, so every rule is unit testable without React.
 */

export interface OrderHistoryFilterCriteria {
  /** Free text, matched across order number, customer, batch and products. */
  readonly query?: string;
  readonly customer?: string;
  readonly orderNumber?: string;
  /** A group_buy_batch_id. */
  readonly batch?: string;
  /** Local calendar dates as <input type="date"> emits them (YYYY-MM-DD). */
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly paymentStatus?: string;
  readonly orderStatus?: string;
}

function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

/**
 * The searchable text of an order, lower-cased.
 *
 * "Batch 8" is included as literal text so a customer can type what they SEE on
 * the card, rather than having to know the batch's name.
 */
function searchCorpus(row: OrderHistoryRow): string {
  const parts: (string | null | undefined)[] = [
    row.order_number,
    row.customer_name,
    row.batch_name,
    row.batch_number != null ? `Batch ${row.batch_number}` : null,
    row.promo_code,
    row.tracking_number,
    ...row.order_items.flatMap((item) => [item.product_name, describeVariation(item)]),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Date bounds are LOCAL, not UTC.
 *
 * created_at is a UTC instant; the customer picked a day on their own calendar.
 * Comparing the ISO date prefix would push a 9pm Manila order into "tomorrow"
 * and drop it out of a range that visibly contains it. Constructing the bound
 * without a timezone suffix makes the runtime read it as local midnight, which
 * is what the customer meant.
 */
function startOfLocalDay(date: string): number {
  return new Date(`${date}T00:00:00`).getTime();
}

function endOfLocalDay(date: string): number {
  return new Date(`${date}T23:59:59.999`).getTime();
}

export function filterOrderHistory(
  rows: readonly OrderHistoryRow[],
  criteria: OrderHistoryFilterCriteria,
): OrderHistoryRow[] {
  const query = clean(criteria.query).toLowerCase();
  const customer = clean(criteria.customer);
  const orderNumber = clean(criteria.orderNumber);
  const batch = clean(criteria.batch);
  const dateFrom = clean(criteria.dateFrom);
  const dateTo = clean(criteria.dateTo);
  const paymentStatus = clean(criteria.paymentStatus);
  const orderStatus = clean(criteria.orderStatus);

  // Every criterion narrows; none of them short-circuits the rest.
  return rows.filter((row) => {
    if (query && !searchCorpus(row).includes(query)) return false;
    if (customer && row.customer_name !== customer) return false;
    if (orderNumber && row.order_number !== orderNumber) return false;
    if (batch && row.group_buy_batch_id !== batch) return false;
    if (paymentStatus && row.payment_status !== paymentStatus) return false;
    if (orderStatus && (row.order_status ?? '') !== orderStatus) return false;

    if (dateFrom || dateTo) {
      const placed = new Date(row.created_at).getTime();
      if (dateFrom && placed < startOfLocalDay(dateFrom)) return false;
      if (dateTo && placed > endOfLocalDay(dateTo)) return false;
    }

    return true;
  });
}

export interface OrderHistoryFilterOptions {
  readonly customers: string[];
  readonly batches: { id: string; label: string }[];
  readonly paymentStatuses: { value: string; label: string }[];
  readonly orderStatuses: { value: string; label: string }[];
}

/**
 * The choices to offer, derived from the rows in hand.
 *
 * Only values actually present are listed, so selecting any option always
 * returns at least one order — a filter that can produce an empty screen is a
 * dead end the customer has to undo.
 */
export function deriveFilterOptions(
  rows: readonly OrderHistoryRow[],
): OrderHistoryFilterOptions {
  const customers = new Set<string>();
  const batches = new Map<string, string>();
  const paymentStatuses = new Set<string>();
  const orderStatuses = new Set<string>();

  for (const row of rows) {
    if (row.customer_name) customers.add(row.customer_name);
    if (row.group_buy_batch_id) {
      batches.set(row.group_buy_batch_id, batchLabel(row) ?? row.group_buy_batch_id);
    }
    if (row.payment_status) paymentStatuses.add(row.payment_status);
    if (row.order_status) orderStatuses.add(row.order_status);
  }

  return {
    customers: [...customers].sort((a, b) => a.localeCompare(b)),
    batches: [...batches.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    paymentStatuses: [...paymentStatuses]
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: paymentStatusLabel(value) })),
    orderStatuses: [...orderStatuses]
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: orderStatusLabel(value) })),
  };
}

/** Whether anything is narrowing the list right now — drives the "Clear" affordance. */
export function hasActiveFilters(criteria: OrderHistoryFilterCriteria): boolean {
  return Object.values(criteria).some((value) => clean(value as string | undefined) !== '');
}
