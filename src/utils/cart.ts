// Pure Peps — cart (de)serialization for the server-backed member cart.
//
// The localStorage cart stores whole Product snapshots, which drift as prices
// and stock change. The SERVER cart instead stores only catalog references
// ({ product_id, variation_id, quantity }) — no PII, no stale snapshot — and we
// rebuild live CartItems from the current catalog on load, dropping anything
// that no longer exists or is out of stock.

import type { CartItem, Product } from '../types';

/** Minimal, PII-free line persisted server-side. */
export interface StoredCartItem {
  product_id: string;
  variation_id: string | null;
  quantity: number;
}

/** Stable identity for a cart line: a product plus its optional variation. */
function lineKey(productId: string, variationId: string | null | undefined): string {
  return `${productId}::${variationId ?? ''}`;
}

/** Reduce cart lines to catalog references + quantity (drops the product snapshot). */
export function serializeCart(items: CartItem[]): StoredCartItem[] {
  return items.map((item) => ({
    product_id: item.product.id,
    variation_id: item.variation?.id ?? null,
    quantity: item.quantity,
  }));
}

/** Whether an untrusted stored row is a well-formed cart reference. */
export function isValidStoredItem(value: unknown): value is StoredCartItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (typeof item.product_id !== 'string' || item.product_id.length === 0) return false;
  if (item.variation_id !== null && typeof item.variation_id !== 'string') return false;
  if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
    return false;
  }
  return true;
}

/**
 * Rebuild cart lines from the LIVE catalog. Silently drops any stored line whose
 * product/variation was deleted or is out of stock, and clamps each surviving
 * line to the currently available stock. Malformed rows are ignored.
 */
export function rehydrateCart(stored: StoredCartItem[], products: Product[]): CartItem[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const result: CartItem[] = [];

  for (const row of stored) {
    if (!isValidStoredItem(row)) continue;

    const product = byId.get(row.product_id);
    if (!product || product.available === false || product.stock_quantity <= 0) continue;

    let availableStock = product.stock_quantity;
    let variation;
    if (row.variation_id) {
      variation = product.variations?.find((v) => v.id === row.variation_id);
      if (!variation || variation.stock_quantity <= 0) continue;
      availableStock = variation.stock_quantity;
    }

    result.push({
      product,
      variation,
      quantity: Math.min(row.quantity, availableStock),
    });
  }

  return result;
}

/**
 * Union two carts, keeping the higher quantity for any line present in both.
 * Lines are matched by product + variation, so nothing is ever silently lost
 * when a member's carts differ across devices.
 */
export function mergeCarts(a: CartItem[], b: CartItem[]): CartItem[] {
  const merged = new Map<string, CartItem>();

  for (const item of [...a, ...b]) {
    const key = lineKey(item.product.id, item.variation?.id);
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, { ...existing, quantity: Math.max(existing.quantity, item.quantity) });
    } else {
      merged.set(key, { ...item });
    }
  }

  return [...merged.values()];
}
