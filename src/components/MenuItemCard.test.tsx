import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MenuItemCard from './MenuItemCard';
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

function makeVariation(overrides: Partial<ProductVariation> = {}): ProductVariation {
  return {
    id: 'var-1',
    product_id: 'prod-1',
    name: '5mg',
    quantity_mg: 5,
    price: 1500,
    disposable_pen_price: null,
    reusable_pen_price: null,
    discount_price: null,
    discount_active: false,
    stock_quantity: 10,
    created_at: '2025-01-01',
    ...overrides,
  };
}

function renderCard(overrides: Partial<React.ComponentProps<typeof MenuItemCard>> = {}) {
  const onAddToCart = vi.fn();
  const onProductClick = vi.fn();
  render(
    <MenuItemCard
      product={baseProduct}
      onAddToCart={onAddToCart}
      onProductClick={onProductClick}
      isVerified
      canCheckout
      {...overrides}
    />,
  );
  return { onAddToCart, onProductClick };
}

describe('MenuItemCard add-to-cart with variations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the bottom sheet drawer instead of adding directly when the product has variations', () => {
    const product = { ...baseProduct, variations: [makeVariation()] };
    const { onAddToCart, onProductClick } = renderCard({ product });

    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }));

    // The shopper must choose a variation in the drawer first — nothing is
    // added to the cart straight from the card.
    expect(onProductClick).toHaveBeenCalledWith(product);
    expect(onAddToCart).not.toHaveBeenCalled();
  });

  it('opens the drawer when the product has multiple variations', () => {
    const product = {
      ...baseProduct,
      variations: [
        makeVariation({ id: 'var-1', name: '5mg' }),
        makeVariation({ id: 'var-2', name: '10mg', price: 2500 }),
      ],
    };
    const { onAddToCart, onProductClick } = renderCard({ product });

    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }));

    expect(onProductClick).toHaveBeenCalledWith(product);
    expect(onAddToCart).not.toHaveBeenCalled();
  });

  it('adds directly to the cart when the product has no variations', () => {
    const product = { ...baseProduct, variations: [] };
    const { onAddToCart, onProductClick } = renderCard({ product });

    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }));

    expect(onAddToCart).toHaveBeenCalledWith(product, undefined, 1);
    expect(onProductClick).not.toHaveBeenCalled();
  });
});
