import { describe, it, expect } from 'vitest';
import { MIN_ORDER_QUANTITY, resolveMinOrder } from './order';
import type { Product, ProductVariation } from '../types';

const baseProduct: Product = {
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
  stock_quantity: 10,
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
  name: '5mg',
  quantity_mg: 5,
  price: 1500,
  disposable_pen_price: null,
  reusable_pen_price: null,
  discount_price: null,
  discount_active: false,
  stock_quantity: 5,
  created_at: '2025-01-01',
};

describe('resolveMinOrder', () => {
  it('uses the variation minimum when a variation is selected', () => {
    const product = { ...baseProduct, minimum_order_quantity: 3 };
    const variation = { ...baseVariation, minimum_order_quantity: 5 };

    expect(resolveMinOrder(product, variation)).toBe(5);
  });

  it('falls back to the product minimum when no variation is selected', () => {
    const product = { ...baseProduct, minimum_order_quantity: 3 };

    expect(resolveMinOrder(product)).toBe(3);
  });

  it('falls back to the product minimum when the variation has no minimum', () => {
    const product = { ...baseProduct, minimum_order_quantity: 4 };
    const variation = { ...baseVariation, minimum_order_quantity: undefined };

    expect(resolveMinOrder(product, variation)).toBe(4);
  });

  it('falls back to MIN_ORDER_QUANTITY when neither has a minimum', () => {
    expect(resolveMinOrder(baseProduct, baseVariation)).toBe(MIN_ORDER_QUANTITY);
    expect(resolveMinOrder(baseProduct)).toBe(MIN_ORDER_QUANTITY);
  });
});
