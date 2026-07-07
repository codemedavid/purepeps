import type { BatchOrder, OrderLineItem } from '../types';
import { csvRow, money, type Cell } from './csv';
import { formatKits } from './groupBuyOverview';

/**
 * Pure CSV builders for the two admin group-buy exports, kept out of React so the
 * shaping can be unit tested without Supabase or the DOM:
 *
 *   1. Members export — one row per order, grouped by member, with each member's
 *      running total and the link to their payment-proof image, for reconciling
 *      who paid what.
 *   2. Items-by-variation export — every product/variation on one sheet with its
 *      total units in vials and kits (e.g. "Tirzepatide 15mg → 30 vials / 3 kits"),
 *      for placing the supplier order.
 *
 * The database stays the source of truth; these helpers only format already-fetched
 * orders. Cancelled orders are excluded from all totals.
 */

const CANCELLED = 'cancelled';
const NEW = 'new';
const NO_VARIATION_LABEL = 'Standard';

/** Case-insensitive email key so `Jane@X.com` and `jane@x.com` group as one member. */
const emailKey = (email: string): string => email.trim().toLowerCase();

function orderUnits(order: BatchOrder): number {
  return (order.order_items ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

// ── Items grouped by product + variation (one sheet) ───────────────────────────

export interface ProductVariationLine {
  product_id: string;
  product_name: string;
  variation_id: string | null;
  variation_name: string;
  /** Distinct non-cancelled orders that include this product+variation. */
  orderCount: number;
  /** Non-cancelled units ordered. */
  unitsOrdered: number;
  /** Non-cancelled units whose order moved past `new` (admin-confirmed). */
  unitsConfirmed: number;
  /** Non-cancelled units still awaiting confirmation. */
  unitsPending: number;
}

const emptyLine = (item: OrderLineItem): ProductVariationLine => ({
  product_id: item.product_id,
  product_name: item.product_name ?? 'Unnamed product',
  variation_id: item.variation_id,
  variation_name: item.variation_name ?? NO_VARIATION_LABEL,
  orderCount: 0,
  unitsOrdered: 0,
  unitsConfirmed: 0,
  unitsPending: 0,
});

/**
 * Flatten a batch's orders into one row per product+variation, summed across every
 * non-cancelled order. Rows are sorted by product name then variation name so the
 * supplier sheet reads top-to-bottom. Items with no variation fall under "Standard".
 */
export function flattenProductVariations(orders: BatchOrder[]): ProductVariationLine[] {
  const byKey = new Map<string, ProductVariationLine>();

  for (const order of orders) {
    if (order.order_status === CANCELLED) continue;
    const confirmed = order.order_status !== NEW;
    const seenInOrder = new Set<string>();

    for (const item of order.order_items ?? []) {
      if (item.product_id == null) continue;
      const key = `${item.product_id}::${item.variation_id ?? '__standard__'}`;
      const qty = item.quantity ?? 0;
      const prev = byKey.get(key) ?? emptyLine(item);

      byKey.set(key, {
        ...prev,
        orderCount: prev.orderCount + (seenInOrder.has(key) ? 0 : 1),
        unitsOrdered: prev.unitsOrdered + qty,
        unitsConfirmed: prev.unitsConfirmed + (confirmed ? qty : 0),
        unitsPending: prev.unitsPending + (confirmed ? 0 : qty),
      });
      seenInOrder.add(key);
    }
  }

  return [...byKey.values()].sort(
    (a, b) =>
      a.product_name.localeCompare(b.product_name) ||
      a.variation_name.localeCompare(b.variation_name),
  );
}

const ITEMS_HEADER = ['Product', 'Variation', 'Orders', 'Vials', 'Kits', 'Confirmed', 'Pending'];

function itemRow(line: ProductVariationLine): Cell[] {
  return [
    line.product_name,
    line.variation_name,
    line.orderCount,
    line.unitsOrdered,
    formatKits(line.unitsOrdered),
    line.unitsConfirmed,
    line.unitsPending,
  ];
}

/** Every product/variation on one sheet with vial and kit totals, plus a totals row. */
export function buildItemsByVariationCsv(orders: BatchOrder[]): string {
  const lines = flattenProductVariations(orders);
  const totalVials = lines.reduce((sum, l) => sum + l.unitsOrdered, 0);
  const totalConfirmed = lines.reduce((sum, l) => sum + l.unitsConfirmed, 0);
  const totalPending = lines.reduce((sum, l) => sum + l.unitsPending, 0);

  return [
    csvRow(ITEMS_HEADER),
    ...lines.map((line) => csvRow(itemRow(line))),
    csvRow(['TOTAL', '', '', totalVials, formatKits(totalVials), totalConfirmed, totalPending]),
  ].join('\n');
}

// ── Members with their orders, totals, and payment-proof links ─────────────────

const MEMBERS_HEADER = [
  'Email',
  'Name',
  'Phone',
  'Order #',
  'Status',
  'Payment',
  'Items',
  'Vials',
  'Order total',
  'Member total',
  'Payment proof',
  'Extra proof',
  'Date',
];

/** "Product Variation ×qty" pieces joined with "; " for a compact order summary. */
function itemsSummary(items: OrderLineItem[]): string {
  return items
    .map((item) => {
      const name = item.variation_name
        ? `${item.product_name} ${item.variation_name}`
        : item.product_name;
      return `${name} ×${item.quantity ?? 0}`;
    })
    .join('; ');
}

/** Non-cancelled spend per member email — the "Member total" shown on every row. */
function memberTotals(orders: BatchOrder[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const order of orders) {
    if (order.order_status === CANCELLED) continue;
    const key = emailKey(order.customer_email);
    totals.set(key, (totals.get(key) ?? 0) + (order.total_price ?? 0));
  }
  return totals;
}

function memberRow(order: BatchOrder, memberTotal: number): Cell[] {
  return [
    order.customer_email,
    order.customer_name,
    order.customer_phone,
    order.order_number ?? order.id.slice(0, 8),
    order.order_status,
    order.payment_status,
    itemsSummary(order.order_items ?? []),
    orderUnits(order),
    money(order.total_price ?? 0),
    money(memberTotal),
    order.payment_proof_url ?? '',
    order.additional_payment_proof_url ?? '',
    order.created_at.slice(0, 10),
  ];
}

/**
 * One row per order, grouped by member (sorted by email, then oldest order first),
 * with the member's non-cancelled running total repeated on each row and the link
 * to each order's payment-proof image. Cancelled orders are still listed for the
 * payment record but do not add to the member total.
 */
export function buildMembersExportCsv(orders: BatchOrder[]): string {
  const totals = memberTotals(orders);
  const sorted = [...orders].sort(
    (a, b) =>
      emailKey(a.customer_email).localeCompare(emailKey(b.customer_email)) ||
      a.created_at.localeCompare(b.created_at),
  );

  return [
    csvRow(MEMBERS_HEADER),
    ...sorted.map((order) => csvRow(memberRow(order, totals.get(emailKey(order.customer_email)) ?? 0))),
  ].join('\n');
}
