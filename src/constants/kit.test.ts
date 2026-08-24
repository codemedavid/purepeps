import { describe, it, expect } from 'vitest';
import { DEFAULT_VIALS_PER_KIT, resolveKitSize } from './kit';
import type { Product, ProductVariation } from '../types';

const baseProduct: Product = {
  id: 'prod-1',
  name: 'Retatrutide',
  description: 'Tri-agonist',
  category: 'Weight Management',
  base_price: 4500,
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
  stock_quantity: 40,
  available: true,
  featured: false,
  image_url: null,
  safety_sheet_url: null,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
};

const baseVariation: ProductVariation = {
  id: 'var-1',
  product_id: 'prod-1',
  name: '10mg',
  quantity_mg: 10,
  price: 3200,
  disposable_pen_price: null,
  reusable_pen_price: null,
  discount_price: null,
  discount_active: false,
  stock_quantity: 20,
  created_at: '2025-01-01',
};

describe('resolveKitSize', () => {
  it('uses the variation kit size when a variation is selected', () => {
    const product = { ...baseProduct, vials_per_kit: 10 };
    const variation = { ...baseVariation, vials_per_kit: 12 };

    expect(resolveKitSize(product, variation)).toBe(12);
  });

  it('falls back to the product kit size when no variation is selected', () => {
    const product = { ...baseProduct, vials_per_kit: 8 };

    expect(resolveKitSize(product)).toBe(8);
  });

  it('falls back to the product kit size when the variation has none of its own', () => {
    const product = { ...baseProduct, vials_per_kit: 8 };
    const variation = { ...baseVariation, vials_per_kit: null };

    expect(resolveKitSize(product, variation)).toBe(8);
  });

  it('falls back to DEFAULT_VIALS_PER_KIT when neither defines one', () => {
    expect(resolveKitSize(baseProduct, baseVariation)).toBe(DEFAULT_VIALS_PER_KIT);
    expect(resolveKitSize(baseProduct)).toBe(DEFAULT_VIALS_PER_KIT);
  });

  it('keeps the historical global default of 10 vials per kit', () => {
    expect(DEFAULT_VIALS_PER_KIT).toBe(10);
  });

  // A zero or negative kit size would make the allocator divide by zero and
  // report an infinite number of kits, so an invalid stored value must never
  // reach the maths.
  it('ignores a non-positive kit size rather than dividing by it', () => {
    expect(resolveKitSize({ ...baseProduct, vials_per_kit: 0 })).toBe(DEFAULT_VIALS_PER_KIT);
    expect(resolveKitSize({ ...baseProduct, vials_per_kit: -5 })).toBe(DEFAULT_VIALS_PER_KIT);
    expect(
      resolveKitSize({ ...baseProduct, vials_per_kit: 6 }, { ...baseVariation, vials_per_kit: 0 }),
    ).toBe(6);
  });

  it('ignores a fractional kit size, which cannot describe whole vials', () => {
    expect(resolveKitSize({ ...baseProduct, vials_per_kit: 7.5 })).toBe(DEFAULT_VIALS_PER_KIT);
  });
});
