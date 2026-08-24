import { countsAsConfirmedOrder } from '../constants/payment';

/**
 * Pure kit-allocation maths for the Ligwak feature ("ligwak" = left behind in an
 * incomplete kit). Side-effect free — no React, no Supabase — so the rule that
 * decides whose money gets refunded can be unit tested directly.
 *
 * THE RULE
 * When a group buy stops taking orders, the confirmed vials of one product
 * variation are packed into kits in the exact sequence the orders were placed.
 * Whole kits ship. Whatever is left over cannot be packed, and the customers
 * holding those trailing vials are ligwak.
 *
 * Two properties this file exists to guarantee:
 *
 *   1. Allocation is by VIAL, not by order. An order that straddles the last
 *      complete kit is split — some vials confirmed, the rest ligwak. Cancelling
 *      such an order wholesale would punish a customer whose vials genuinely did
 *      fill a kit.
 *
 *   2. Ordering is total and deterministic. Re-running the allocation over the
 *      same orders must never move a different customer into the incomplete kit,
 *      so equal timestamps fall back to order number and then id rather than
 *      being left to sort stability.
 */

/** One stored line of an order, narrowed to what the allocation reads. */
export interface AllocatableLineItem {
  readonly product_id: string;
  readonly variation_id: string | null;
  readonly quantity: number;
}

/**
 * An order as the allocator sees it. Structural rather than the concrete
 * BatchOrder so the same maths can run over an admin list, an RPC payload or a
 * test fixture without any of them depending on the others.
 */
export interface AllocatableOrder {
  readonly id: string;
  readonly order_number: string | null;
  readonly created_at: string;
  readonly order_status?: string | null;
  readonly payment_type?: string | null;
  readonly payment_status?: string | null;
  readonly manually_confirmed_at?: string | null;
  readonly order_items: readonly AllocatableLineItem[];
}

/** The (product, variation) queue being packed, and how big its kits are. */
export interface KitStream {
  readonly productId: string;
  /** null for a product with no variations — its own single stream. */
  readonly variationId: string | null;
  readonly kitSize: number;
}

/** One order's slice of the allocation ledger. */
export interface KitAllocationEntry {
  readonly orderId: string;
  readonly orderNumber: string | null;
  /** 0-based position in the oldest-first ledger. */
  readonly sequence: number;
  readonly orderedAt: string;
  /** Vials of this stream on this order. Always confirmedQty + ligwakQty. */
  readonly quantity: number;
  readonly confirmedQty: number;
  readonly ligwakQty: number;
  /** 1-based kit this order's first vial landed in. */
  readonly firstKitIndex: number;
  /** 1-based kit its last vial landed in — differs when the order spans kits. */
  readonly lastKitIndex: number;
}

export interface KitAllocation {
  readonly productId: string;
  readonly variationId: string | null;
  /** Snapshotted: a later edit to the product must not move a locked allocation. */
  readonly kitSize: number;
  readonly totalConfirmedVials: number;
  readonly completeKits: number;
  readonly ligwakVials: number;
  readonly entries: readonly KitAllocationEntry[];
}

/** Vials of one stream on one order, summing repeated lines of the same item. */
function streamQuantity(order: AllocatableOrder, stream: KitStream): number {
  return order.order_items.reduce((sum, item) => {
    if (item.product_id !== stream.productId) return sum;
    if ((item.variation_id ?? null) !== stream.variationId) return sum;
    return sum + Math.max(0, Number(item.quantity) || 0);
  }, 0);
}

/**
 * Total order over the queue: placement time first, then order number, then id.
 *
 * The tie-breaks are not decoration. Two orders placed in the same instant would
 * otherwise be separated only by however the rows happened to arrive, and a
 * recalculation could swap which of them is ligwak — silently moving a refund
 * from one customer to another.
 */
function byPlacementTime(a: AllocatableOrder, b: AllocatableOrder): number {
  const at = Date.parse(a.created_at);
  const bt = Date.parse(b.created_at);
  if (at !== bt) return at - bt;
  const an = a.order_number ?? '';
  const bn = b.order_number ?? '';
  if (an !== bn) return an < bn ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Pack one product variation's confirmed vials into kits, oldest order first,
 * and report who is left holding the incomplete kit.
 *
 * Eligibility is delegated to countsAsConfirmedOrder — the same predicate the
 * group-buy caps and admin KPIs already use, mirrored from the database. Ligwak
 * must be computed over exactly the demand the caps counted, so this deliberately
 * does not define a second notion of "confirmed".
 *
 * Pure: returns fresh objects and never mutates the orders it is given.
 */
export function allocateKits(
  orders: readonly AllocatableOrder[],
  stream: KitStream,
): KitAllocation {
  const kitSize = Math.max(1, Math.floor(stream.kitSize));

  const participants = orders
    .filter((order) => countsAsConfirmedOrder(order) && streamQuantity(order, stream) > 0)
    .slice()
    .sort(byPlacementTime);

  const totalConfirmedVials = participants.reduce(
    (sum, order) => sum + streamQuantity(order, stream),
    0,
  );
  const completeKits = Math.floor(totalConfirmedVials / kitSize);
  // Vials sitting inside a whole kit. Everything past this line is ligwak.
  const packedVials = completeKits * kitSize;

  let cursor = 0;
  const entries = participants.map((order, sequence) => {
    const quantity = streamQuantity(order, stream);
    // How much of this order falls before the packed/ligwak boundary.
    const confirmedQty = Math.max(0, Math.min(quantity, packedVials - cursor));
    const entry: KitAllocationEntry = {
      orderId: order.id,
      orderNumber: order.order_number,
      sequence,
      orderedAt: order.created_at,
      quantity,
      confirmedQty,
      ligwakQty: quantity - confirmedQty,
      firstKitIndex: Math.floor(cursor / kitSize) + 1,
      lastKitIndex: Math.floor((cursor + quantity - 1) / kitSize) + 1,
    };
    cursor += quantity;
    return entry;
  });

  return {
    productId: stream.productId,
    variationId: stream.variationId,
    kitSize,
    totalConfirmedVials,
    completeKits,
    ligwakVials: totalConfirmedVials - packedVials,
    entries,
  };
}
