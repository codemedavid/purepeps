import { describe, it, expect } from 'vitest';
import {
  DEFAULT_UNIVERSAL_MINIMUM,
  MINIMUM_ORDER_UNITS,
  combinedQuantityFor,
  meetsMinimum,
  minimumOrderNotice,
  minimumOrderShortfall,
  resolveMinimumOrder,
  universalMinimumFromRows,
  universalMinimumToRows,
  validateCartMinimums,
  type UniversalMinimumOrder,
} from './minimumOrder';
import type { CartItem, Product, ProductVariation } from '../types';

const UNIVERSAL_ON: UniversalMinimumOrder = { enabled: true, quantity: 5, unit: 'vial' };
const UNIVERSAL_OFF: UniversalMinimumOrder = { enabled: false, quantity: 5, unit: 'vial' };

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'BPC-157',
    description: 'Recovery peptide',
    category: 'Recovery',
    base_price: 2500,
    discount_price: null,
    discount_start_date: null,
    discount_end_date: null,
    discount_active: false,
    purity_percentage: 99,
    molecular_weight: null,
    cas_number: null,
    sequence: null,
    storage_conditions: 'Refrigerate',
    inclusions: null,
    stock_quantity: 100,
    available: true,
    featured: false,
    image_url: null,
    safety_sheet_url: null,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    ...overrides,
  };
}

function variation(overrides: Partial<ProductVariation> = {}): ProductVariation {
  return {
    id: 'var-1',
    product_id: 'prod-1',
    name: '10mg',
    quantity_mg: 10,
    price: 1500,
    disposable_pen_price: null,
    reusable_pen_price: null,
    discount_price: null,
    discount_active: false,
    stock_quantity: 100,
    ...overrides,
  };
}

function line(quantity: number, overrides: Partial<CartItem> = {}): CartItem {
  return { product: product(), quantity, ...overrides };
}

describe('resolveMinimumOrder — which number applies', () => {
  it('follows the universal setting by default', () => {
    const rule = resolveMinimumOrder(product(), UNIVERSAL_ON);

    expect(rule).toMatchObject({ enforced: true, quantity: 5, unit: 'vial' });
  });

  it('enforces nothing when the universal requirement is switched off', () => {
    const rule = resolveMinimumOrder(product(), UNIVERSAL_OFF);

    expect(rule.enforced).toBe(false);
  });

  it('lets one product override the universal quantity', () => {
    const rule = resolveMinimumOrder(
      product({ use_universal_minimum: false, minimum_order_quantity: 12 }),
      UNIVERSAL_ON,
    );

    expect(rule).toMatchObject({ enforced: true, quantity: 12 });
  });

  it('lets an overriding product carry its own unit', () => {
    const rule = resolveMinimumOrder(
      product({ use_universal_minimum: false, minimum_order_quantity: 2, minimum_order_unit: 'box' }),
      UNIVERSAL_ON,
    );

    expect(rule.unit).toBe('box');
  });

  it('honours a per-product override even when the universal switch is OFF', () => {
    // "Turn the universal requirement off" means stop applying it by default,
    // not strip a minimum an admin set deliberately on one product.
    const rule = resolveMinimumOrder(
      product({ use_universal_minimum: false, minimum_order_quantity: 12 }),
      UNIVERSAL_OFF,
    );

    expect(rule).toMatchObject({ enforced: true, quantity: 12 });
  });

  it('lets one product opt out of minimums entirely', () => {
    const rule = resolveMinimumOrder(
      product({ minimum_order_enabled: false, minimum_order_quantity: 12 }),
      UNIVERSAL_ON,
    );

    expect(rule.enforced).toBe(false);
  });

  it('treats a missing quantity on an overriding product as no minimum', () => {
    const rule = resolveMinimumOrder(product({ use_universal_minimum: false }), UNIVERSAL_ON);

    expect(rule.enforced).toBe(false);
  });

  it('never enforces a minimum below one', () => {
    const rule = resolveMinimumOrder(
      product({ use_universal_minimum: false, minimum_order_quantity: 0 }),
      UNIVERSAL_ON,
    );

    expect(rule.enforced).toBe(false);
  });

  it('combines variations by default', () => {
    expect(resolveMinimumOrder(product(), UNIVERSAL_ON).combineVariations).toBe(true);
  });

  it('enforces per variation when the admin asks for it', () => {
    const rule = resolveMinimumOrder(
      product({ enforce_minimum_per_variation: true }),
      UNIVERSAL_ON,
    );

    expect(rule.combineVariations).toBe(false);
  });
});

describe('combinedQuantityFor', () => {
  it('adds every variation of the same product together', () => {
    // The client's example: 4 of 10mg + 3 of 20mg + 3 of 30mg meets a 10 minimum.
    const items: CartItem[] = [
      line(4, { variation: variation({ id: 'v10', name: '10mg' }) }),
      line(3, { variation: variation({ id: 'v20', name: '20mg' }) }),
      line(3, { variation: variation({ id: 'v30', name: '30mg' }) }),
    ];

    expect(combinedQuantityFor(items, 'prod-1')).toBe(10);
  });

  it('ignores lines belonging to other products', () => {
    const items: CartItem[] = [
      line(4),
      line(9, { product: product({ id: 'prod-2', name: 'TB-500' }) }),
    ];

    expect(combinedQuantityFor(items, 'prod-1')).toBe(4);
  });

  it('counts a single variation when asked for that variation alone', () => {
    const items: CartItem[] = [
      line(4, { variation: variation({ id: 'v10' }) }),
      line(3, { variation: variation({ id: 'v20' }) }),
    ];

    expect(combinedQuantityFor(items, 'prod-1', 'v10')).toBe(4);
  });

  it('returns zero for a product that is not in the cart', () => {
    expect(combinedQuantityFor([line(4)], 'prod-9')).toBe(0);
  });
});

describe('meetsMinimum', () => {
  const rule = resolveMinimumOrder(product(), UNIVERSAL_ON);

  it('accepts exactly the minimum', () => {
    expect(meetsMinimum(rule, 5)).toBe(true);
  });

  it('rejects one below the minimum', () => {
    expect(meetsMinimum(rule, 4)).toBe(false);
  });

  it('accepts an empty line, because nothing ordered breaks no rule', () => {
    // A product absent from the cart must not block checkout.
    expect(meetsMinimum(rule, 0)).toBe(true);
  });

  it('always passes when no minimum is enforced', () => {
    expect(meetsMinimum(resolveMinimumOrder(product(), UNIVERSAL_OFF), 1)).toBe(true);
  });
});

describe('customer-facing wording', () => {
  it('states the requirement on the product, in the client’s words', () => {
    const rule = resolveMinimumOrder(product(), UNIVERSAL_ON);

    expect(minimumOrderNotice(rule)).toBe('Minimum order: 5 vials for this product.');
  });

  it('names the shortfall in the client’s words', () => {
    const rule = resolveMinimumOrder(product(), UNIVERSAL_ON);

    expect(minimumOrderShortfall(rule)).toBe(
      'This product requires a minimum order of 5 vials. Please update your quantity to continue.',
    );
  });

  it('says nothing when no minimum is enforced', () => {
    expect(minimumOrderNotice(resolveMinimumOrder(product(), UNIVERSAL_OFF))).toBeNull();
  });

  it('uses the singular for a minimum of one', () => {
    const rule = resolveMinimumOrder(product(), { enabled: true, quantity: 1, unit: 'vial' });

    expect(minimumOrderNotice(rule)).toBe('Minimum order: 1 vial for this product.');
  });

  it('pluralises box as boxes, not boxs', () => {
    const rule = resolveMinimumOrder(product(), { enabled: true, quantity: 3, unit: 'box' });

    expect(minimumOrderNotice(rule)).toBe('Minimum order: 3 boxes for this product.');
  });

  it('prefers a message the admin wrote for this product', () => {
    const rule = resolveMinimumOrder(
      product({ minimum_order_message: 'Sold in packs of five only.' }),
      UNIVERSAL_ON,
    );

    expect(minimumOrderNotice(rule)).toBe('Sold in packs of five only.');
  });

  it('drops an admin message that is only whitespace', () => {
    const rule = resolveMinimumOrder(product({ minimum_order_message: '   ' }), UNIVERSAL_ON);

    expect(minimumOrderNotice(rule)).toBe('Minimum order: 5 vials for this product.');
  });
});

describe('universal settings storage', () => {
  it('offers the units the client listed', () => {
    expect([...MINIMUM_ORDER_UNITS]).toEqual(['vial', 'piece', 'box', 'kit']);
  });

  it('reads the three settings rows', () => {
    const universal = universalMinimumFromRows([
      { id: 'universal_minimum_order_enabled', value: 'true' },
      { id: 'universal_minimum_order_quantity', value: '5' },
      { id: 'universal_minimum_order_unit', value: 'box' },
    ]);

    expect(universal).toEqual({ enabled: true, quantity: 5, unit: 'box' });
  });

  it('falls back to the default when the rows have never been seeded', () => {
    expect(universalMinimumFromRows([])).toEqual(DEFAULT_UNIVERSAL_MINIMUM);
  });

  it('defaults to OFF so applying the migration changes no shopper’s cart', () => {
    // Switching a site-wide minimum on silently would start rejecting carts
    // that were valid a moment earlier.
    expect(DEFAULT_UNIVERSAL_MINIMUM.enabled).toBe(false);
  });

  it('ignores a quantity that is not a positive whole number', () => {
    const universal = universalMinimumFromRows([
      { id: 'universal_minimum_order_enabled', value: 'true' },
      { id: 'universal_minimum_order_quantity', value: 'lots' },
    ]);

    expect(universal.quantity).toBe(DEFAULT_UNIVERSAL_MINIMUM.quantity);
  });

  it('ignores a unit the admin UI could not have produced', () => {
    const universal = universalMinimumFromRows([
      { id: 'universal_minimum_order_unit', value: 'truckload' },
    ]);

    expect(universal.unit).toBe(DEFAULT_UNIVERSAL_MINIMUM.unit);
  });

  it('round-trips through the settings rows', () => {
    const original: UniversalMinimumOrder = { enabled: true, quantity: 7, unit: 'kit' };

    expect(universalMinimumFromRows(universalMinimumToRows(original))).toEqual(original);
  });
});

describe('validateCartMinimums', () => {
  it('passes a cart that meets every minimum', () => {
    const items: CartItem[] = [line(5)];

    expect(validateCartMinimums(items, UNIVERSAL_ON)).toEqual([]);
  });

  it('accepts the client’s split across three variations', () => {
    // 4 + 3 + 3 = 10. No single line reaches 10, and that is the whole point.
    const items: CartItem[] = [
      line(4, {
        product: product({ use_universal_minimum: false, minimum_order_quantity: 10 }),
        variation: variation({ id: 'v10' }),
      }),
      line(3, {
        product: product({ use_universal_minimum: false, minimum_order_quantity: 10 }),
        variation: variation({ id: 'v20' }),
      }),
      line(3, {
        product: product({ use_universal_minimum: false, minimum_order_quantity: 10 }),
        variation: variation({ id: 'v30' }),
      }),
    ];

    expect(validateCartMinimums(items, UNIVERSAL_ON)).toEqual([]);
  });

  it('reports a product whose combined quantity is short', () => {
    const items: CartItem[] = [line(2), line(1, { variation: variation({ id: 'v20' }) })];

    const violations = validateCartMinimums(items, UNIVERSAL_ON);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      productId: 'prod-1',
      productName: 'BPC-157',
      required: 5,
      actual: 3,
    });
  });

  it('reports one violation per product, not one per line', () => {
    // Three short lines of the same product is ONE thing to fix, and three
    // copies of the same banner reads as three separate problems.
    const items: CartItem[] = [
      line(1, { variation: variation({ id: 'v10' }) }),
      line(1, { variation: variation({ id: 'v20' }) }),
      line(1, { variation: variation({ id: 'v30' }) }),
    ];

    expect(validateCartMinimums(items, UNIVERSAL_ON)).toHaveLength(1);
  });

  it('carries the message a shopper should act on', () => {
    const violations = validateCartMinimums([line(2)], UNIVERSAL_ON);

    expect(violations[0].message).toBe(
      'This product requires a minimum order of 5 vials. Please update your quantity to continue.',
    );
  });

  it('judges each variation alone when the product opts into that', () => {
    const perVariation = product({ enforce_minimum_per_variation: true });
    const items: CartItem[] = [
      line(4, { product: perVariation, variation: variation({ id: 'v10' }) }),
      line(3, { product: perVariation, variation: variation({ id: 'v20' }) }),
    ];

    // Combined this is 7 and would pass; judged separately both fall short.
    const violations = validateCartMinimums(items, UNIVERSAL_ON);

    expect(violations).toHaveLength(2);
    expect(violations[0].variationName).toBe('10mg');
  });

  it('says nothing about an empty cart', () => {
    expect(validateCartMinimums([], UNIVERSAL_ON)).toEqual([]);
  });

  it('says nothing when minimums are switched off site-wide', () => {
    expect(validateCartMinimums([line(1)], UNIVERSAL_OFF)).toEqual([]);
  });
});
