import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductDetailModal from './ProductDetailModal';
import { MIN_ORDER_QUANTITY } from '../constants/order';
import type { Product, ProductVariation } from '../types';

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

  it('starts at the per-product minimum when it exceeds the default', () => {
    const product = { ...mockProduct, minimum_order_quantity: 3 };
    renderModal({ product });
    expect(screen.getByTestId('quantity-value')).toHaveTextContent('3');
  });

  it('uses the selected variation minimum and floors decrement at it', () => {
    const variation: ProductVariation = {
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
      minimum_order_quantity: 4,
      created_at: '2025-01-01',
    };
    const product = { ...mockProduct, variations: [variation] };
    renderModal({ product });

    expect(screen.getByTestId('quantity-value')).toHaveTextContent('4');

    const decrement = screen.getByRole('button', { name: /decrease quantity/i });
    fireEvent.click(decrement);
    fireEvent.click(decrement);
    expect(screen.getByTestId('quantity-value')).toHaveTextContent('4');
  });
});

describe('ProductDetailModal view-only mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the add button and labels it "Coming soon" when view-only is on', () => {
    renderModal({ isViewOnly: true });
    const addButton = screen.getByRole('button', { name: /coming soon/i });
    expect(addButton).toBeDisabled();
  });

  it('does not add to cart when the button is clicked in view-only mode', () => {
    const { onAddToCart } = renderModal({ isViewOnly: true });
    fireEvent.click(screen.getByRole('button', { name: /coming soon/i }));
    expect(onAddToCart).not.toHaveBeenCalled();
  });
});

describe('ProductDetailModal variation cap', () => {
  const variation: ProductVariation = {
    id: 'var-1',
    product_id: 'prod-1',
    name: '10mg',
    quantity_mg: 10,
    price: 1500,
    disposable_pen_price: null,
    reusable_pen_price: null,
    discount_price: null,
    discount_active: false,
    stock_quantity: 50,
    created_at: '2025-01-01',
  };
  const product = { ...mockProduct, variations: [variation] };

  it("shows the variation's own cap, overriding the product cap", () => {
    renderModal({
      product,
      groupBuyItem: {
        product_id: 'prod-1',
        product_name: 'BPC-157',
        total_quantity: 90,
        confirmed_quantity: 0,
        order_count: 5,
        cancelled_quantity: 0,
        cap_quantity: 100, // product cap would leave 10
        variations: [
          { variation_id: 'var-1', variation_name: '10mg', total_quantity: 3, cap_quantity: 5 },
        ],
      },
    });

    // Variation cap governs: 3 / 5 reserved, not the product's 90 / 100.
    expect(screen.getByText(/3 \/ 5 reserved/)).toBeInTheDocument();
    expect(screen.queryByText(/90 \/ 100 reserved/)).not.toBeInTheDocument();
    // 2 units left under the variation cap.
    expect(screen.getByText(/2 more available for you to order/)).toBeInTheDocument();
  });

  it('blocks add-to-cart when the variation cap is full even if the product has room', () => {
    const { onAddToCart } = renderModal({
      product,
      groupBuyItem: {
        product_id: 'prod-1',
        product_name: 'BPC-157',
        total_quantity: 10,
        confirmed_quantity: 0,
        order_count: 1,
        cancelled_quantity: 0,
        cap_quantity: 100, // lots of product room
        variations: [
          { variation_id: 'var-1', variation_name: '10mg', total_quantity: 5, cap_quantity: 5 },
        ],
      },
    });

    const addButton = screen.getByRole('button', { name: /group limit reached/i });
    fireEvent.click(addButton);
    expect(onAddToCart).not.toHaveBeenCalled();
  });
});

describe('ProductDetailModal — minimum order', () => {
  const UNIVERSAL_ON = { enabled: true, quantity: 5, unit: 'vial' as const };

  it('states the minimum in the product details', () => {
    renderModal({ universalMinimum: UNIVERSAL_ON });

    expect(screen.getByText('Minimum order: 5 vials for this product.')).toBeInTheDocument();
  });

  it('starts the quantity selector at the minimum', () => {
    // The client asked for this explicitly. Opening at 1 under a minimum of 5
    // invites the shopper to set a quantity that will be rejected.
    renderModal({ universalMinimum: UNIVERSAL_ON });

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows an admin’s own wording instead of the generated notice', () => {
    renderModal({
      product: { ...mockProduct, minimum_order_message: 'Sold in packs of five only.' },
      universalMinimum: UNIVERSAL_ON,
    });

    expect(screen.getByText('Sold in packs of five only.')).toBeInTheDocument();
  });

  it('says nothing when no minimum applies', () => {
    renderModal({ universalMinimum: { enabled: false, quantity: 5, unit: 'vial' as const } });

    expect(screen.queryByText(/minimum order/i)).not.toBeInTheDocument();
  });
});
