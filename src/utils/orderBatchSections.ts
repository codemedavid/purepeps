import { printableWaybillOrders } from './waybill';

/** Minimal shape of a group-buy batch, used to label and section batch orders. */
export interface BatchSummary {
  id: string;
  batch_number: number;
  name: string | null;
  status: string;
}

/** Section id for orders that belong to no group-buy batch. */
export const REGULAR_SECTION_ID = '__regular__';

/** Section id for orders whose batch row is missing — deleted, or not yet loaded. */
export const UNKNOWN_BATCH_SECTION_ID = '__unknown_batch__';

export const batchLabel = (batch: BatchSummary): string =>
  `Batch #${batch.batch_number}${batch.name ? ` · ${batch.name}` : ''}`;

/** A headed group of orders rendered together, with its own print run. */
export interface OrderBatchSection<T> {
  /** Stable key — a batch id, or one of the two sentinels above. */
  id: string;
  /** The heading shown above the group, and the section's accessible name. */
  headline: string;
  orders: T[];
  /**
   * The subset of `orders` that has a shipment to print, by the same rule the
   * whole-view print run uses. Always a subset of this section's own orders, so
   * a section's print button can never reach a neighbouring batch.
   */
  printableOrders: T[];
}

type GroupableOrder = {
  group_buy_batch_id?: string | null;
  order_status?: string | null;
};

/**
 * Group orders into headed sections by group-buy batch, in the order the
 * batches arrive — Supabase hands them over sorted by batch number descending,
 * which is the same order the batch filter lists them in. Batches with nothing
 * in the current view are skipped, so the sections describe what the admin is
 * actually looking at rather than the whole catalogue of drops.
 *
 * Two trailing sections catch everything else: orders whose batch row is gone
 * (deleted while its orders lived on) and orders that were never part of a
 * drop. Neither is silently dropped from the list.
 *
 * Sections are built from the already-filtered view, so status, batch and
 * search narrowing all still apply — grouping partitions what survived those
 * filters, it does not reach around them.
 */
export function groupOrdersIntoBatchSections<T extends GroupableOrder>(
  orders: readonly T[],
  batches: readonly BatchSummary[],
): OrderBatchSection<T>[] {
  const sections: OrderBatchSection<T>[] = [];

  const addSection = (id: string, headline: string, rows: T[]): void => {
    if (rows.length === 0) return;
    sections.push({ id, headline, orders: rows, printableOrders: printableWaybillOrders(rows) });
  };

  for (const batch of batches) {
    addSection(
      batch.id,
      batchLabel(batch),
      orders.filter((order) => order.group_buy_batch_id === batch.id),
    );
  }

  const knownBatchIds = new Set(batches.map((batch) => batch.id));

  addSection(
    UNKNOWN_BATCH_SECTION_ID,
    'Group Buy',
    orders.filter(
      (order) => order.group_buy_batch_id && !knownBatchIds.has(order.group_buy_batch_id),
    ),
  );

  addSection(
    REGULAR_SECTION_ID,
    'Regular orders',
    orders.filter((order) => !order.group_buy_batch_id),
  );

  return sections;
}
