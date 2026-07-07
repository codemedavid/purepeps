import { describe, it, expect } from 'vitest';
import {
  serializeCart,
  rehydrateCart,
  mergeCarts,
  isValidStoredItem,
  cartSubtotal,
  type StoredCartItem,
} from './cart';
import type { CartItem, Product, ProductVariation } from '../types';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'BPC-157',
    description: '',
    category: 'cat-repair',
    base_price: 1000,
    discount_price: null,
    discount_start_date: null,
    discount_end_date: null,
    discount_active: false,
    purity_percentage: 99,
    molecular_weight: null,
    cas_number: null,
    sequence: null,
    storage_conditions: '',
    inclusions: null,
    stock_quantity: 10,
    available: true,
    featured: false,
    image_url: null,
    safety_sheet_url: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function makeVariation(overrides: Partial<ProductVariation> = {}): ProductVariation {
  return {
    id: 'var-1',
    product_id: 'prod-1',
    name: '10mg',
    quantity_mg: 10,
    price: 1200,
    disposable_pen_price: null,
    reusable_pen_price: null,
    discount_price: null,
    discount_active: false,
    stock_quantity: 5,
    ...overrides,
  } as ProductVariation;
}

function line(product: Product, quantity: number, variation?: ProductVariation): CartItem {
  return { product, variation, quantity };
}

describe('serializeCart', () => {
  it('reduces cart lines to catalog ids and quantities only (no PII, no snapshot)', () => {
    const p = makeProduct();
    const v = makeVariation();
    const result = serializeCart([line(p, 3, v), line(makeProduct({ id: 'prod-2' }), 2)]);

    expect(result).toEqual([
      { product_id: 'prod-1', variation_id: 'var-1', quantity: 3 },
      { product_id: 'prod-2', variation_id: null, quantity: 2 },
    ]);
  });
});

describe('isValidStoredItem', () => {
  it('accepts a well-formed stored item', () => {
    expect(isValidStoredItem({ product_id: 'p', variation_id: null, quantity: 2 })).toBe(true);
    expect(isValidStoredItem({ product_id: 'p', variation_id: 'v', quantity: 1 })).toBe(true);
  });

  it('rejects malformed items (missing id, non-positive/non-integer qty, wrong types)', () => {
    expect(isValidStoredItem(null)).toBe(false);
    expect(isValidStoredItem({ product_id: '', variation_id: null, quantity: 1 })).toBe(false);
    expect(isValidStoredItem({ product_id: 'p', variation_id: null, quantity: 0 })).toBe(false);
    expect(isValidStoredItem({ product_id: 'p', variation_id: null, quantity: -3 })).toBe(false);
    expect(isValidStoredItem({ product_id: 'p', variation_id: null, quantity: 1.5 })).toBe(false);
    expect(isValidStoredItem({ product_id: 'p', variation_id: 5, quantity: 1 })).toBe(false);
    expect(isValidStoredItem({ variation_id: null, quantity: 1 })).toBe(false);
  });
});

describe('rehydrateCart', () => {
  it('rebuilds cart lines from the LIVE catalog, not the stored snapshot', () => {
    const stored: StoredCartItem[] = [{ product_id: 'prod-1', variation_id: null, quantity: 2 }];
    // Live catalog has a newer price than whatever the shopper saw before.
    const live = [makeProduct({ base_price: 1500 })];

    const [item] = rehydrateCart(stored, live);

    expect(item.product.base_price).toBe(1500);
    expect(item.quantity).toBe(2);
    expect(item.variation).toBeUndefined();
  });

  it('attaches the matching live variation', () => {
    const v = makeVariation();
    const stored: StoredCartItem[] = [{ product_id: 'prod-1', variation_id: 'var-1', quantity: 1 }];
    const live = [makeProduct({ variations: [v] })];

    const [item] = rehydrateCart(stored, live);

    expect(item.variation?.id).toBe('var-1');
  });

  it('drops items whose product no longer exists', () => {
    const stored: StoredCartItem[] = [{ product_id: 'gone', variation_id: null, quantity: 1 }];
    expect(rehydrateCart(stored, [makeProduct()])).toEqual([]);
  });

  it('drops items whose variation no longer exists', () => {
    const stored: StoredCartItem[] = [{ product_id: 'prod-1', variation_id: 'gone', quantity: 1 }];
    const live = [makeProduct({ variations: [makeVariation()] })];
    expect(rehydrateCart(stored, live)).toEqual([]);
  });

  it('drops out-of-stock and unavailable products', () => {
    const stored: StoredCartItem[] = [{ product_id: 'prod-1', variation_id: null, quantity: 1 }];
    expect(rehydrateCart(stored, [makeProduct({ stock_quantity: 0 })])).toEqual([]);
    expect(rehydrateCart(stored, [makeProduct({ available: false })])).toEqual([]);
  });

  it('drops out-of-stock variations', () => {
    const stored: StoredCartItem[] = [{ product_id: 'prod-1', variation_id: 'var-1', quantity: 1 }];
    const live = [makeProduct({ variations: [makeVariation({ stock_quantity: 0 })] })];
    expect(rehydrateCart(stored, live)).toEqual([]);
  });

  it('clamps quantity down to available stock', () => {
    const stored: StoredCartItem[] = [{ product_id: 'prod-1', variation_id: null, quantity: 99 }];
    const [item] = rehydrateCart(stored, [makeProduct({ stock_quantity: 4 })]);
    expect(item.quantity).toBe(4);
  });

  it('ignores malformed stored rows without throwing', () => {
    const stored = [
      { product_id: 'prod-1', variation_id: null, quantity: 2 },
      { product_id: '', variation_id: null, quantity: 1 },
      null,
    ] as unknown as StoredCartItem[];
    const result = rehydrateCart(stored, [makeProduct()]);
    expect(result).toHaveLength(1);
  });
});

describe('mergeCarts (union, max quantity)', () => {
  it('unions distinct lines from both carts', () => {
    const p1 = makeProduct({ id: 'prod-1' });
    const p2 = makeProduct({ id: 'prod-2' });
    const merged = mergeCarts([line(p1, 2)], [line(p2, 3)]);
    expect(merged).toHaveLength(2);
  });

  it('takes the higher quantity for a line present in both', () => {
    const p = makeProduct();
    const merged = mergeCarts([line(p, 2)], [line(p, 5)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(5);
  });

  it('treats the same product with different variations as distinct lines', () => {
    const p = makeProduct();
    const vA = makeVariation({ id: 'var-A' });
    const vB = makeVariation({ id: 'var-B' });
    const merged = mergeCarts([line(p, 1, vA)], [line(p, 1, vB)]);
    expect(merged).toHaveLength(2);
  });

  it('never loses an item present in only one cart', () => {
    const p1 = makeProduct({ id: 'prod-1' });
    const p2 = makeProduct({ id: 'prod-2' });
    const p3 = makeProduct({ id: 'prod-3' });
    const merged = mergeCarts([line(p1, 1), line(p2, 1)], [line(p2, 4), line(p3, 1)]);
    const ids = merged.map((i) => i.product.id).sort();
    expect(ids).toEqual(['prod-1', 'prod-2', 'prod-3']);
    expect(merged.find((i) => i.product.id === 'prod-2')?.quantity).toBe(4);
  });
});

describe('cartSubtotal', () => {
  it('is 0 for an empty cart', () => {
    expect(cartSubtotal([])).toBe(0);
  });

  it('sums base price times quantity for products without a variation', () => {
    const product = makeProduct({ base_price: 1000 });
    expect(cartSubtotal([line(product, 3)])).toBe(3000);
  });

  it('uses the active product discount price when set', () => {
    const product = makeProduct({
      base_price: 1000,
      discount_active: true,
      discount_price: 800,
    });
    expect(cartSubtotal([line(product, 2)])).toBe(1600);
  });

  it('uses the variation price when a variation is selected', () => {
    const product = makeProduct();
    const variation = makeVariation({ price: 1200 });
    expect(cartSubtotal([line(product, 2, variation)])).toBe(2400);
  });

  it('adds up multiple lines', () => {
    const a = makeProduct({ id: 'a', base_price: 500 });
    const b = makeProduct({ id: 'b', base_price: 250 });
    expect(cartSubtotal([line(a, 2), line(b, 4)])).toBe(2000);
  });
});
