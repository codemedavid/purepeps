import type { Product, ProductVariation } from '../types';

/**
 * Fallback minimum number of vials a shopper must order per product line, used
 * when neither the product nor the selected variation defines its own minimum.
 */
export const MIN_ORDER_QUANTITY = 2;

/**
 * Resolve the effective minimum order quantity for a cart line or detail view.
 *
 * A selected variation's minimum takes precedence over the product's minimum,
 * which in turn falls back to MIN_ORDER_QUANTITY. This keeps persisted carts and
 * legacy rows (missing the field) safe.
 */
export function resolveMinOrder(
  product: Product,
  variation?: ProductVariation
): number {
  return (
    variation?.minimum_order_quantity ??
    product.minimum_order_quantity ??
    MIN_ORDER_QUANTITY
  );
}
