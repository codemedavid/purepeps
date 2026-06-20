import type { BatchOrder, GroupBuyProgressItem } from '../types';

/**
 * Pure, side-effect-free selectors that power the Group Buy admin command center
 * (KPI strip, overview tab, order search). Kept out of React so the dashboard math
 * can be unit tested without Supabase. The database remains the source of truth;
 * these helpers only shape already-fetched data for display.
 */

const CANCELLED = 'cancelled';
const NEW = 'new';
const PAID = 'paid';

const isCancelled = (order: BatchOrder): boolean => order.order_status === CANCELLED;

export interface BatchKpis {
  /** Every order attached to the batch, cancelled included. */
  totalOrders: number;
  /** Non-cancelled orders — the live order count. */
  activeOrders: number;
  cancelledOrders: number;
  /** Non-cancelled orders still awaiting confirmation (status `new`). */
  toConfirmCount: number;
  /** Non-cancelled orders whose payment is marked paid. */
  paidOrders: number;
  /** Non-cancelled claim/add-on orders. */
  claimOrders: number;
  /** Sum of total_price across non-cancelled orders. */
  grossRevenue: number;
  /** Sum of total_price across non-cancelled, paid orders — money actually in. */
  paidRevenue: number;
  /** Sum of line-item quantities across non-cancelled orders. */
  totalUnits: number;
}

const EMPTY_KPIS: BatchKpis = {
  totalOrders: 0,
  activeOrders: 0,
  cancelledOrders: 0,
  toConfirmCount: 0,
  paidOrders: 0,
  claimOrders: 0,
  grossRevenue: 0,
  paidRevenue: 0,
  totalUnits: 0,
};

function orderUnits(order: BatchOrder): number {
  return (order.order_items ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

/** Roll a batch's orders up into the headline numbers shown in the KPI strip. */
export function computeBatchKpis(orders: BatchOrder[]): BatchKpis {
  return orders.reduce<BatchKpis>((acc, order) => {
    const cancelled = isCancelled(order);
    const total = order.total_price ?? 0;
    return {
      totalOrders: acc.totalOrders + 1,
      activeOrders: acc.activeOrders + (cancelled ? 0 : 1),
      cancelledOrders: acc.cancelledOrders + (cancelled ? 1 : 0),
      toConfirmCount: acc.toConfirmCount + (!cancelled && order.order_status === NEW ? 1 : 0),
      paidOrders: acc.paidOrders + (!cancelled && order.payment_status === PAID ? 1 : 0),
      claimOrders: acc.claimOrders + (!cancelled && order.is_claim ? 1 : 0),
      grossRevenue: acc.grossRevenue + (cancelled ? 0 : total),
      paidRevenue:
        acc.paidRevenue + (!cancelled && order.payment_status === PAID ? total : 0),
      totalUnits: acc.totalUnits + (cancelled ? 0 : orderUnits(order)),
    };
  }, { ...EMPTY_KPIS });
}

export interface CapFillSummary {
  /** Number of products that carry a cap in this batch. */
  cappedProducts: number;
  /** Sum of every cap. */
  totalCap: number;
  /** Sum of reserved (non-cancelled) units against capped products. */
  totalReserved: number;
  /** Reserved / cap as a 0..100 integer, clamped. */
  fillPct: number;
  /** Capped products that have reached or exceeded their cap. */
  fullProducts: number;
}

/** Aggregate cap utilisation across the batch for the "caps at a glance" bar. */
export function summarizeCapFill(items: GroupBuyProgressItem[]): CapFillSummary {
  const capped = items.filter((item) => item.cap_quantity != null);
  const totalCap = capped.reduce((sum, item) => sum + (item.cap_quantity ?? 0), 0);
  const totalReserved = capped.reduce((sum, item) => sum + item.total_quantity, 0);
  const fullProducts = capped.filter(
    (item) => item.cap_quantity != null && item.total_quantity >= item.cap_quantity,
  ).length;
  const fillPct =
    totalCap > 0 ? Math.min(100, Math.round((totalReserved / totalCap) * 100)) : 0;
  return {
    cappedProducts: capped.length,
    totalCap,
    totalReserved,
    fillPct,
    fullProducts,
  };
}

/** New orders awaiting confirmation, oldest first (longest-waiting needs attention soonest). */
export function ordersNeedingAction(orders: BatchOrder[]): BatchOrder[] {
  return orders
    .filter((order) => order.order_status === NEW)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export interface OrderFilter {
  query: string;
  status: 'all' | string;
}

function orderMatchesQuery(order: BatchOrder, needle: string): boolean {
  const haystacks: (string | null | undefined)[] = [
    order.order_number,
    order.customer_name,
    order.customer_email,
    order.customer_phone,
    ...(order.order_items ?? []).flatMap((item) => [item.product_name, item.variation_name]),
  ];
  return haystacks.some((value) => value != null && value.toLowerCase().includes(needle));
}

/** Filter a batch's orders by status and a free-text query over identity + items. */
export function filterBatchOrders(orders: BatchOrder[], filter: OrderFilter): BatchOrder[] {
  const needle = filter.query.trim().toLowerCase();
  return orders.filter((order) => {
    if (filter.status !== 'all' && order.order_status !== filter.status) return false;
    if (needle && !orderMatchesQuery(order, needle)) return false;
    return true;
  });
}
