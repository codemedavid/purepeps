import type { Product, ProductVariation } from '../types';

/**
 * Vials in one complete kit when neither the product nor the selected variation
 * says otherwise. 10 is the figure the group-buy overview has always assumed;
 * keeping it as the fallback means every existing product behaves exactly as it
 * did before kit size became configurable.
 */
export const DEFAULT_VIALS_PER_KIT = 10;

/**
 * A kit size only means something if it is a positive whole number of vials.
 *
 * This is not defensive noise: the Ligwak allocator divides the confirmed vial
 * count by this number. A 0 would report an infinite number of complete kits and
 * a fractional one would invent kits that cannot be packed, so an unusable value
 * is treated as "not set" and falls through to the next source.
 */
function usableKitSize(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

/**
 * Resolve the effective vials-per-complete-kit for a product line.
 *
 * A selected variation's kit size takes precedence over the product's, which in
 * turn falls back to DEFAULT_VIALS_PER_KIT. This is deliberately the same
 * variation → product → global chain as resolveMinOrder() and the cap resolution
 * in remainingForVariation(), so the three settings an admin configures per
 * product all behave identically.
 *
 * Different strengths are packed and shipped separately — a 10mg vial does not
 * fill a 5mg kit — which is why the variation gets the final say.
 */
export function resolveKitSize(
  product: Pick<Product, 'vials_per_kit'>,
  variation?: Pick<ProductVariation, 'vials_per_kit'> | null,
): number {
  return (
    usableKitSize(variation?.vials_per_kit) ??
    usableKitSize(product.vials_per_kit) ??
    DEFAULT_VIALS_PER_KIT
  );
}
