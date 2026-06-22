import type { BatchOrder, GroupBuyProgressItem } from '../types';
import { resellableUnits, freedUnits, productDemandState } from './groupBuy';
import type { BatchPhase, ProductDemandState } from './groupBuy';

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

export interface ItemRevenue {
  product_id: string;
  product_name: string | null;
  /** Distinct non-cancelled orders that include this product. */
  orderCount: number;
  /** Non-cancelled units ordered. */
  unitsOrdered: number;
  /** Non-cancelled units whose order moved past `new` (admin-confirmed). */
  unitsConfirmed: number;
  /** Non-cancelled units still awaiting confirmation. */
  unitsPending: number;
  /** Line-item value across non-cancelled orders — money expected. */
  grossRevenue: number;
  /** Line-item value across non-cancelled, paid orders — money actually collected. */
  collectedRevenue: number;
}

export interface ItemRevenueSummary {
  /** Per-product closeout, sorted by product name. */
  rows: ItemRevenue[];
  totalUnitsOrdered: number;
  totalUnitsConfirmed: number;
  totalUnitsPending: number;
  totalGrossRevenue: number;
  totalCollectedRevenue: number;
}

/** Line value, preferring the stored total but falling back to price × quantity. */
function lineTotal(item: { total?: number | null; price?: number | null; quantity?: number | null }): number {
  if (item.total != null) return item.total;
  return (item.price ?? 0) * (item.quantity ?? 0);
}

const emptyItemRevenue = (productId: string, productName: string | null): ItemRevenue => ({
  product_id: productId,
  product_name: productName,
  orderCount: 0,
  unitsOrdered: 0,
  unitsConfirmed: 0,
  unitsPending: 0,
  grossRevenue: 0,
  collectedRevenue: 0,
});

/**
 * Roll a batch's orders up into per-item closeout numbers: how many orders and
 * units landed on each product, how many are confirmed vs still pending, and the
 * gross vs collected (paid) money per product. Derived purely from the orders in
 * view so it stays correct for closed/finalized batches, where the live progress
 * RPC no longer returns counts. Cancelled orders are excluded throughout.
 */
export function summarizeItemRevenue(orders: BatchOrder[]): ItemRevenueSummary {
  const byProduct = new Map<string, ItemRevenue>();

  for (const order of orders) {
    if (isCancelled(order)) continue;
    const paid = order.payment_status === PAID;
    const confirmed = order.order_status !== NEW; // already non-cancelled here
    const seenInOrder = new Set<string>();

    for (const item of order.order_items ?? []) {
      const id = item.product_id;
      if (id == null) continue;
      const qty = item.quantity ?? 0;
      const value = lineTotal(item);
      const prev = byProduct.get(id) ?? emptyItemRevenue(id, item.product_name ?? null);

      byProduct.set(id, {
        ...prev,
        product_name: prev.product_name ?? item.product_name ?? null,
        orderCount: prev.orderCount + (seenInOrder.has(id) ? 0 : 1),
        unitsOrdered: prev.unitsOrdered + qty,
        unitsConfirmed: prev.unitsConfirmed + (confirmed ? qty : 0),
        unitsPending: prev.unitsPending + (confirmed ? 0 : qty),
        grossRevenue: prev.grossRevenue + value,
        collectedRevenue: prev.collectedRevenue + (paid ? value : 0),
      });
      seenInOrder.add(id);
    }
  }

  const rows = [...byProduct.values()].sort((a, b) =>
    (a.product_name ?? '').localeCompare(b.product_name ?? ''),
  );

  return {
    rows,
    totalUnitsOrdered: rows.reduce((sum, row) => sum + row.unitsOrdered, 0),
    totalUnitsConfirmed: rows.reduce((sum, row) => sum + row.unitsConfirmed, 0),
    totalUnitsPending: rows.reduce((sum, row) => sum + row.unitsPending, 0),
    totalGrossRevenue: rows.reduce((sum, row) => sum + row.grossRevenue, 0),
    totalCollectedRevenue: rows.reduce((sum, row) => sum + row.collectedRevenue, 0),
  };
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

export interface ResellItem {
  product_id: string;
  product_name: string | null;
  /** Units this capped product can still sell (cap − non-cancelled reserved). */
  resellable: number;
  /** Of `resellable`, how many were freed by cancellations (a subset, not additive). */
  freed: number;
}

export interface ResaleSummary {
  /** Capped products that currently have at least one unit available to resell. */
  itemsToResell: ResellItem[];
  /** Total units available to resell across all capped products. */
  totalResellable: number;
  /** Total units freed by cancellations (a subset of totalResellable). */
  totalFreed: number;
}

/**
 * Roll capped products up into the "available to resell" view shown while a batch
 * is finalizing. Only capped products can be resold (uncapped products have no
 * ceiling to sell against). `resellable` already includes units freed by
 * cancellations, so `freed` is reported as a subset for context — never added on
 * top of `resellable`.
 */
export function summarizeResale(items: GroupBuyProgressItem[]): ResaleSummary {
  const itemsToResell = items.reduce<ResellItem[]>((acc, item) => {
    const resellable = resellableUnits(item);
    if (resellable == null || resellable <= 0) return acc;
    return [
      ...acc,
      {
        product_id: item.product_id,
        product_name: item.product_name,
        resellable,
        freed: Math.min(freedUnits(item), resellable),
      },
    ];
  }, []);
  return {
    itemsToResell,
    totalResellable: itemsToResell.reduce((sum, item) => sum + item.resellable, 0),
    totalFreed: itemsToResell.reduce((sum, item) => sum + item.freed, 0),
  };
}

export interface DemandSummary {
  /** Per-product demand, sorted by name, limited to products with demand or a cap. */
  rows: ProductDemandState[];
  /** Total non-cancelled units ordered across the batch. */
  totalOrdered: number;
  /** Total confirmed (past `new`) units across the batch. */
  totalConfirmed: number;
  /** Total units still awaiting confirmation across the batch. */
  totalPending: number;
  /** Sum of the phase-relevant headline across capped products (uncapped excluded). */
  totalHighlight: number;
  /** The label shared by every row's headline number in this phase. */
  highlightLabel: string;
}

/** Products worth a row: any real demand, or a cap that constrains future orders. */
function hasBoardRelevance(item: GroupBuyProgressItem): boolean {
  return (item.total_quantity ?? 0) > 0 || item.cap_quantity != null;
}

/**
 * Roll the batch's per-product progress into the phase-aware status board model.
 * Shapes already-fetched data only — the database stays the source of truth. The
 * headline column is phase-driven (see productDemandState): "Left" while open,
 * "To take over" while finalizing, "Confirmed" once finalized/closed.
 */
export function summarizeDemand(
  items: GroupBuyProgressItem[],
  phase: BatchPhase,
): DemandSummary {
  const rows = items
    .filter(hasBoardRelevance)
    .map((item) => productDemandState(item, phase))
    .sort((a, b) => (a.product_name ?? '').localeCompare(b.product_name ?? ''));
  return {
    rows,
    totalOrdered: rows.reduce((sum, row) => sum + row.ordered, 0),
    totalConfirmed: rows.reduce((sum, row) => sum + row.confirmed, 0),
    totalPending: rows.reduce((sum, row) => sum + row.pending, 0),
    totalHighlight: rows.reduce((sum, row) => sum + (row.highlight ?? 0), 0),
    highlightLabel: rows[0]?.highlightLabel ?? '',
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
