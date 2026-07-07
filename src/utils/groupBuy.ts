import type {
  GroupBuyProgressItem,
  GroupBuyProgressVariation,
  GroupBuyBatch,
} from '../types';

/**
 * Pure helpers for group-buy cap math, shared by the storefront (cap display +
 * add-to-cart clamping) and the admin dashboard. Kept side-effect free so the
 * cap logic can be unit tested without mocking Supabase. The database trigger
 * (enforce_group_buy_on_order) remains the authoritative backstop — these
 * helpers only drive UX.
 */

export function findProgressItem(
  items: GroupBuyProgressItem[],
  productId: string,
): GroupBuyProgressItem | undefined {
  return items.find((item) => item.product_id === productId);
}

/**
 * Units that can still be ordered for a product under its batch cap.
 * Returns `null` when there is no cap (unlimited). Never negative.
 */
export function remainingForProduct(item: GroupBuyProgressItem | undefined): number | null {
  if (!item || item.cap_quantity == null) return null;
  return Math.max(0, item.cap_quantity - item.total_quantity);
}

/**
 * Remaining capacity after accounting for units the shopper already has in
 * their cart for this product. Returns `null` when there is no cap.
 */
export function remainingAfterCart(
  item: GroupBuyProgressItem | undefined,
  inCartQuantity: number,
): number | null {
  const remaining = remainingForProduct(item);
  if (remaining == null) return null;
  return Math.max(0, remaining - Math.max(0, inCartQuantity));
}

/** True when a capped product has no remaining capacity in the current batch. */
export function isSoldOut(item: GroupBuyProgressItem | undefined): boolean {
  const remaining = remainingForProduct(item);
  return remaining != null && remaining <= 0;
}

/** The per-variation progress row for a product, or undefined when absent. */
export function findVariationProgress(
  item: GroupBuyProgressItem | undefined,
  variationId: string | null,
): GroupBuyProgressVariation | undefined {
  return item?.variations?.find((v) => v.variation_id === variationId);
}

/**
 * Units still orderable for a specific variation, honoring the cap resolution rule:
 *   1. Variation cap set  → variation headroom (cap − variation total). Overrides
 *      the product cap for that variation.
 *   2. No variation cap, product capped → the SHARED fallback pool: the product cap
 *      minus units already ordered against variations that lack their own cap
 *      (product total − units of variation-capped variations). All uncapped
 *      variations of the product draw from this one pool.
 *   3. Neither capped → `null` (unlimited).
 * Returns `null` when the item is missing. Never negative.
 */
export function remainingForVariation(
  item: GroupBuyProgressItem | undefined,
  variationId: string | null,
): number | null {
  if (!item) return null;

  const variation = findVariationProgress(item, variationId);
  if (variation && variation.cap_quantity != null) {
    return Math.max(0, variation.cap_quantity - variation.total_quantity);
  }

  if (item.cap_quantity == null) return null;

  const cappedVariationUnits = (item.variations ?? []).reduce(
    (sum, v) => (v.cap_quantity != null ? sum + v.total_quantity : sum),
    0,
  );
  const poolUsed = Math.max(0, item.total_quantity - cappedVariationUnits);
  return Math.max(0, item.cap_quantity - poolUsed);
}

/**
 * Variation remaining after accounting for units the shopper already has in their
 * cart for this variation. Returns `null` when the variation is unlimited.
 */
export function remainingForVariationAfterCart(
  item: GroupBuyProgressItem | undefined,
  variationId: string | null,
  inCartQuantity: number,
): number | null {
  const remaining = remainingForVariation(item, variationId);
  if (remaining == null) return null;
  return Math.max(0, remaining - Math.max(0, inCartQuantity));
}

/** True when a capped variation has no remaining capacity in the current batch. */
export function isVariationSoldOut(
  item: GroupBuyProgressItem | undefined,
  variationId: string | null,
): boolean {
  const remaining = remainingForVariation(item, variationId);
  return remaining != null && remaining <= 0;
}

/**
 * "Pasalo mode" eligibility: true for products that still have remaining slots
 * under any cap — the product-level cap OR any per-variation cap. A product with
 * no product cap but variation caps that still have room is eligible (its
 * variation caps override/replace the product cap for those variations), and a
 * product whose product pool is full stays eligible if a capped variation still
 * has slots. Uncapped products and fully-capped products are excluded so the
 * re-opening storefront shows only items still needing orders. Reuses
 * remainingForProduct / remainingForVariation so the math stays single-sourced.
 */
export function isPasaloEligible(item: GroupBuyProgressItem | undefined): boolean {
  if (!item) return false;

  const productRemaining = remainingForProduct(item);
  if (productRemaining != null && productRemaining > 0) return true;

  return (item.variations ?? []).some((v) => {
    if (v.cap_quantity == null) return false;
    const remaining = remainingForVariation(item, v.variation_id);
    return remaining != null && remaining > 0;
  });
}

/** Minimal cart-line shape the availability helpers read: a product plus its
 * optional variation. Kept structural so callers can pass full CartItems (or any
 * superset) without this module depending on the cart's concrete type. */
interface CartLineRef {
  product: { id: string };
  variation?: { id: string } | null;
}

/**
 * True when a cart line can no longer be ordered under the current batch caps —
 * its resolved variation/product headroom is exhausted (remaining ≤ 0). Lines
 * with no cap (unlimited) are never sold out. This is the "no longer available"
 * signal the cart uses to exclude filled items from checkout while letting the
 * still-available lines through.
 */
export function isCartLineSoldOut(
  line: CartLineRef,
  items: GroupBuyProgressItem[],
): boolean {
  const variationId = line.variation?.id ?? null;
  const remaining = remainingForVariation(findProgressItem(items, line.product.id), variationId);
  return remaining != null && remaining <= 0;
}

/**
 * Split cart lines into the subset still orderable under the batch caps and the
 * sold-out remainder. Pure: returns new arrays, preserves order, never mutates
 * the input. With no caps (empty `items`) every line is available.
 */
export function partitionCartAvailability<T extends CartLineRef>(
  lines: readonly T[],
  items: GroupBuyProgressItem[],
): { available: T[]; unavailable: T[] } {
  const available: T[] = [];
  const unavailable: T[] = [];
  for (const line of lines) {
    if (isCartLineSoldOut(line, items)) {
      unavailable.push(line);
    } else {
      available.push(line);
    }
  }
  return { available, unavailable };
}

/**
 * Filters a product list to the pasalo-eligible subset: capped products with
 * remaining capacity in the current batch. Pure — returns a new array and never
 * mutates the input. An empty `items` list (no open batch) yields no matches.
 */
export function filterPasaloProducts<T extends { id: string }>(
  products: readonly T[],
  items: GroupBuyProgressItem[],
): T[] {
  return products.filter((product) =>
    isPasaloEligible(findProgressItem(items, product.id)),
  );
}

/**
 * Units still claimable for a capped product against its cap. `total_quantity`
 * already excludes cancelled units, so this mirrors `remainingForProduct` but is
 * named for the finalizing/claim flow. Returns `null` when there is no cap.
 */
export function claimableRemaining(item: GroupBuyProgressItem): number | null {
  if (item.cap_quantity == null) return null;
  return Math.max(0, item.cap_quantity - item.total_quantity);
}

/** Units freed back into the batch by cancellations for this product. */
export function freedUnits(item: GroupBuyProgressItem): number {
  return item.cancelled_quantity ?? 0;
}

/** Non-cancelled units whose order has been admin-confirmed (moved past `new`). */
export function confirmedUnits(item: GroupBuyProgressItem): number {
  return Math.max(0, item.confirmed_quantity ?? 0);
}

/**
 * Non-cancelled units still awaiting confirmation. Derived from the totals so the
 * confirmed + pending parts always add back up to total_quantity. Never negative.
 */
export function pendingUnits(item: GroupBuyProgressItem): number {
  return Math.max(0, (item.total_quantity ?? 0) - confirmedUnits(item));
}

/**
 * Units a capped product can still sell during finalizing — the single honest
 * "available to resell" figure. Because total_quantity already excludes cancelled
 * orders, freed units are baked into this number (see freedUnits for the subset
 * that came from cancellations). Returns `null` when the product is uncapped.
 */
export function resellableUnits(item: GroupBuyProgressItem): number | null {
  return remainingForProduct(item);
}

/**
 * Whether the admin may reopen a CLOSED batch. Any closed batch qualifies — the
 * only constraint is that just one batch may be open at a time, so reopening is
 * blocked while another batch already holds the open slot. Non-closed batches
 * follow the normal lifecycle transitions, not this rule, so they always return
 * false here. The reopen_group_buy_batch RPC enforces the same one-open
 * constraint server-side — this only drives whether the UI offers the button.
 */
export function canReopenClosedBatch(
  batch: Pick<GroupBuyBatch, 'id' | 'status'>,
  batches: readonly Pick<GroupBuyBatch, 'id' | 'status'>[],
): boolean {
  if (batch.status !== 'closed') return false;
  return !batches.some((b) => b.id !== batch.id && b.status === 'open');
}

/** Group-buy lifecycle phase that drives which headline number the board shows. */
export type BatchPhase = 'open' | 'finalizing' | 'finalized' | 'closed';

/**
 * A single product's demand, shaped for the phase-aware status board. Every count
 * is non-negative; `cap`/`remaining`/`highlight` are `null` when the product is
 * uncapped (unlimited). `highlight` + `highlightLabel` carry the one number the
 * admin scans fastest in the current phase:
 *   - open       → units still orderable under the cap ("Left")
 *   - finalizing → units freed/available to hand to other buyers ("To take over")
 *   - finalized/closed → confirmed units locked in ("Confirmed")
 */
export interface ProductDemandState {
  product_id: string;
  product_name: string | null;
  /** Non-cancelled units ordered for this product. */
  ordered: number;
  confirmed: number;
  pending: number;
  cap: number | null;
  /** Cap headroom (cap − ordered), or `null` when uncapped. Never negative. */
  remaining: number | null;
  /** Units freed by cancellations — a subset already inside `remaining`. */
  freed: number;
  /** Phase-relevant headline count; `null` when uncapped. */
  highlight: number | null;
  highlightLabel: string;
  /** True when a capped product has been ordered beyond its cap. */
  overCap: boolean;
}

function highlightLabelFor(phase: BatchPhase): string {
  if (phase === 'open') return 'Left';
  if (phase === 'finalizing') return 'To take over';
  return 'Confirmed';
}

/**
 * Collapse a raw progress item into the phase-aware view the status board needs.
 * Pure: no dependency on React or the fetch layer, so the board math is unit
 * testable in isolation.
 */
export function productDemandState(
  item: GroupBuyProgressItem,
  phase: BatchPhase,
): ProductDemandState {
  const ordered = Math.max(0, item.total_quantity ?? 0);
  const confirmed = confirmedUnits(item);
  const remaining = remainingForProduct(item);
  const highlight =
    phase === 'finalized' || phase === 'closed' ? confirmed : remaining;
  return {
    product_id: item.product_id,
    product_name: item.product_name,
    ordered,
    confirmed,
    pending: pendingUnits(item),
    cap: item.cap_quantity ?? null,
    remaining,
    freed: freedUnits(item),
    highlight,
    highlightLabel: highlightLabelFor(phase),
    overCap: item.cap_quantity != null && ordered > item.cap_quantity,
  };
}
