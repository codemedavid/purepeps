import type { BatchOrder } from '../types';
import type { ItemRevenue, ItemRevenueSummary } from './groupBuyOverview';
import { csvRow, money, type Cell } from './csv';

/**
 * Pure CSV builders for the end-of-group-buy closeout. Kept out of React so the
 * admin can copy a per-item breakdown (for supplier ordering and accounting) and
 * the full order list (for fulfilment) without any rendering concerns. Shares the
 * RFC-4180 cell/row/money primitives with the other exports via ./csv.
 */

const ITEM_HEADER = [
  'Product',
  'Orders',
  'Units ordered',
  'Confirmed',
  'Pending',
  'Gross revenue',
  'Collected revenue',
];

function itemRow(row: ItemRevenue): Cell[] {
  return [
    row.product_name ?? 'Unnamed product',
    row.orderCount,
    row.unitsOrdered,
    row.unitsConfirmed,
    row.unitsPending,
    money(row.grossRevenue),
    money(row.collectedRevenue),
  ];
}

/** Per-item closeout as CSV, with a trailing totals row. */
export function buildItemRevenueCsv(summary: ItemRevenueSummary): string {
  const lines = [
    csvRow(ITEM_HEADER),
    ...summary.rows.map((row) => csvRow(itemRow(row))),
    csvRow([
      'TOTAL',
      '',
      summary.totalUnitsOrdered,
      summary.totalUnitsConfirmed,
      summary.totalUnitsPending,
      money(summary.totalGrossRevenue),
      money(summary.totalCollectedRevenue),
    ]),
  ];
  return lines.join('\n');
}

const ORDER_HEADER = [
  'Order #',
  'Customer',
  'Phone',
  'Status',
  'Payment',
  'Tracking',
  'Units',
  'Total',
];

function orderUnits(order: BatchOrder): number {
  return (order.order_items ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

function orderRow(order: BatchOrder): Cell[] {
  return [
    order.order_number ?? order.id.slice(0, 8),
    order.customer_name,
    order.customer_phone,
    order.order_status,
    order.payment_status,
    order.tracking_number ?? '',
    orderUnits(order),
    money(order.total_price ?? 0),
  ];
}

/** Full order list as CSV for fulfilment/remittance, every order included. */
export function buildOrderListCsv(orders: BatchOrder[]): string {
  return [csvRow(ORDER_HEADER), ...orders.map((order) => csvRow(orderRow(order)))].join('\n');
}

/** Combined closeout export: the per-item breakdown above the full order list. */
export function buildBatchCloseoutCsv(summary: ItemRevenueSummary, orders: BatchOrder[]): string {
  return `${buildItemRevenueCsv(summary)}\n\nORDERS\n${buildOrderListCsv(orders)}`;
}
