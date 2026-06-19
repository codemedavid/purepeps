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
