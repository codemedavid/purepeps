import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductDetailModal from './ProductDetailModal';
import { MIN_ORDER_QUANTITY } from '../constants/order';
import type { Product } from '../types';

const mockProduct: Product = {
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

function renderModal(overrides: Partial<React.ComponentProps<typeof ProductDetailModal>> = {}) {
  const onAddToCart = vi.fn();
  const onClose = vi.fn();
  render(
    <ProductDetailModal
      product={mockProduct}
      onClose={onClose}
      onAddToCart={onAddToCart}
      isVerified
      canCheckout
      {...overrides}
    />,
  );
  return { onAddToCart, onClose };
}

describe('ProductDetailModal quantity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts at the minimum order quantity', () => {
    renderModal();
    expect(screen.getByTestId('quantity-value')).toHaveTextContent(String(MIN_ORDER_QUANTITY));
  });

  it('does not let the shopper decrement below the minimum order quantity', () => {
    renderModal();
    const decrement = screen.getByRole('button', { name: /decrease quantity/i });
    // Click decrement several times; it must never drop below the minimum.
    fireEvent.click(decrement);
    fireEvent.click(decrement);
    expect(screen.getByTestId('quantity-value')).toHaveTextContent(String(MIN_ORDER_QUANTITY));
  });

  it('adds to cart with at least the minimum order quantity', () => {
    const { onAddToCart } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }));
    expect(onAddToCart).toHaveBeenCalledWith(mockProduct, undefined, MIN_ORDER_QUANTITY);
  });
});
