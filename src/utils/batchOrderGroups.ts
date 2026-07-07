import type { BatchOrder } from '../types';

/**
 * Group a batch's orders the way the admin window shows them: every repeat
 * checkout from the same customer in the same open batch is linked to their
 * first order via parent_order_id (server-side trigger), so those orders share
 * ONE reference — the root order's number — while each keeps its own payment,
 * proof, status, and tracking.
 *
 * This mirrors the customer-facing sequenceBundleOrders() in orderTracking.ts,
 * but operates on the admin BatchOrder shape and additionally returns claim
 * add-ons and group totals so the panel can render a grouped card.
 *
 * Side-effect free so the grouping rules can be unit-tested without React.
 */

/** One order paired with its admin-facing sequence label ("Order 2"). */
export interface SequencedBatchOrder {
  readonly order: BatchOrder;
  /** 1-based position in the customer's order sequence within the batch. */
  readonly sequence: number;
  readonly label: string;
}

/** A customer's orders inside one batch, grouped under a single reference. */
export interface OrderGroup {
  /** The shared reference shown in the window (root order_number, id fallback). */
  readonly reference: string;
  readonly root: BatchOrder;
  /** Non-claim orders, root first, numbered "Order 1", "Order 2", … */
  readonly sequenced: readonly SequencedBatchOrder[];
  /** Leftover-claim add-ons — shown separately, never numbered. */
  readonly addOns: readonly BatchOrder[];
  /** Every order in the group (sequenced + add-ons), for counts and selection. */
  readonly allOrders: readonly BatchOrder[];
  /** Combined total_price across every order in the group. */
  readonly groupTotal: number;
  /** Most recent created_at in the group — used to rank groups newest-first. */
  readonly latestActivityAt: string;
  /** True when the group holds more than one order (needs grouped chrome). */
  readonly isMulti: boolean;
}

/** One selectable order in the group, for the detail view's sibling nav. */
export interface OrderSequenceSibling {
  readonly id: string;
  readonly label: string;
  readonly isCurrent: boolean;
}

/** Where the open order sits within its group — drives "Order 2 of 3" + nav. */
export interface OrderSequenceContext {
  readonly reference: string;
  /** "Order 2" for a numbered order, or "Add-on" for a claim. */
  readonly label: string;
  /** 1-based position among the numbered orders; 0 for a claim add-on. */
  readonly position: number;
  /** Count of numbered orders in the group (the "of 3"). */
  readonly total: number;
  readonly siblings: readonly OrderSequenceSibling[];
}

/**
 * Resolve an order's ultimate root id by following parent_order_id within the
 * loaded set. Repeat orders point straight at the root, but a claim may point at
 * a child, so we walk the chain. A cycle guard and a missing-parent fallback keep
 * a broken link from looping or escaping the batch — the order becomes its own root.
 */
function resolveRootId(order: BatchOrder, byId: ReadonlyMap<string, BatchOrder>): string {
  const visited = new Set<string>();
  let current = order;
  while (current.parent_order_id != null && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = byId.get(current.parent_order_id);
    if (!parent) break; // Broken/out-of-batch link — stop at the deepest known node.
    current = parent;
  }
  return current.id;
}

function referenceFor(root: BatchOrder): string {
  return root.order_number || root.id.slice(0, 8).toUpperCase();
}

function toGroup(rootId: string, members: BatchOrder[], byId: ReadonlyMap<string, BatchOrder>): OrderGroup {
  // The root is the linked-from order; fall back to the earliest member if the
  // resolved root somehow isn't in this batch's set.
  const root =
    byId.get(rootId) ??
    [...members].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

  const ownOrders = members.filter((order) => !order.is_claim);
  const sequenced: SequencedBatchOrder[] = [...ownOrders]
    .sort((a, b) => {
      // The root is always Order 1; repeats follow by creation time.
      const aIsRoot = a.id === rootId ? 0 : 1;
      const bIsRoot = b.id === rootId ? 0 : 1;
      if (aIsRoot !== bIsRoot) return aIsRoot - bIsRoot;
      return a.created_at.localeCompare(b.created_at);
    })
    .map((order, index) => ({ order, sequence: index + 1, label: `Order ${index + 1}` }));

  const addOns = members
    .filter((order) => order.is_claim)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Cancelled orders free their units back and are never billed, so they must
  // not inflate the reference header total the admin reads as "what's owed".
  const groupTotal = members.reduce(
    (sum, order) => (order.order_status === 'cancelled' ? sum : sum + (order.total_price ?? 0)),
    0,
  );
  const latestActivityAt = members.reduce(
    (latest, order) => (order.created_at > latest ? order.created_at : latest),
    members[0]?.created_at ?? '',
  );

  return {
    reference: referenceFor(root),
    root,
    sequenced,
    addOns,
    allOrders: members,
    groupTotal,
    latestActivityAt,
    isMulti: members.length > 1,
  };
}

/**
 * Group a batch's orders by customer (via parent_order_id linkage) and return
 * the groups newest-activity first, preserving the panel's existing feel where a
 * lone order is just a single-order group.
 */
export function groupBatchOrders(orders: readonly BatchOrder[]): OrderGroup[] {
  if (orders.length === 0) return [];

  const byId = new Map(orders.map((order) => [order.id, order]));

  const membersByRoot = new Map<string, BatchOrder[]>();
  for (const order of orders) {
    const rootId = resolveRootId(order, byId);
    const bucket = membersByRoot.get(rootId);
    if (bucket) {
      bucket.push(order);
    } else {
      membersByRoot.set(rootId, [order]);
    }
  }

  return [...membersByRoot.entries()]
    .map(([rootId, members]) => toGroup(rootId, members, byId))
    .sort((a, b) => b.latestActivityAt.localeCompare(a.latestActivityAt));
}

/**
 * Describe where `currentId` sits inside its group so the detail view can show
 * "Order 2 of 3 · PP-0001" with links to the customer's other orders. Numbered
 * orders come first, then claim add-ons.
 */
export function buildOrderSequenceContext(
  group: OrderGroup,
  currentId: string,
): OrderSequenceContext {
  const addOnLabel = (index: number): string =>
    group.addOns.length > 1 ? `Add-on ${index + 1}` : 'Add-on';

  const siblings: OrderSequenceSibling[] = [
    ...group.sequenced.map((seq) => ({
      id: seq.order.id,
      label: seq.label,
      isCurrent: seq.order.id === currentId,
    })),
    ...group.addOns.map((order, index) => ({
      id: order.id,
      label: addOnLabel(index),
      isCurrent: order.id === currentId,
    })),
  ];

  const seq = group.sequenced.find((s) => s.order.id === currentId);
  const addOnIndex = group.addOns.findIndex((o) => o.id === currentId);
  const label = seq ? seq.label : addOnIndex >= 0 ? addOnLabel(addOnIndex) : '';

  return {
    reference: group.reference,
    label,
    position: seq ? seq.sequence : 0,
    total: group.sequenced.length,
    siblings,
  };
}
