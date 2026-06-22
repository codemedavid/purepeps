import type { GroupBuyProgressItem } from '../types';

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
