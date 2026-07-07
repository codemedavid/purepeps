import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MenuItemCard from './MenuItemCard';
import type { Product, ProductVariation, GroupBuyProgressItem } from '../types';

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

describe('MenuItemCard view-only mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the CTA and labels it "Coming soon" when view-only is on', () => {
    renderCard({ isViewOnly: true });

    const cta = screen.getByRole('button', { name: /coming soon/i });
    expect(cta).toBeDisabled();
  });

  it('never adds to cart from the disabled CTA in view-only mode', () => {
    // Viewing is the whole point of view-only mode, so opening the detail drawer
    // stays allowed; the only guarantee is that nothing lands in the cart.
    const product = { ...baseProduct, variations: [makeVariation()] };
    const { onAddToCart } = renderCard({ product, isViewOnly: true });

    fireEvent.click(screen.getByRole('button', { name: /coming soon/i }));

    expect(onAddToCart).not.toHaveBeenCalled();
  });
});

describe('MenuItemCard combined variation caps (no product cap)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the combined remaining across capped variations when the product has no product-level cap', () => {
    const product = {
      ...baseProduct,
      variations: [
        makeVariation({ id: 'var-1', name: '5mg' }),
        makeVariation({ id: 'var-2', name: '10mg', price: 2500 }),
      ],
    };
    // No product cap, but each variation is capped: 10−3=7 and 5−1=4 → 11 left of 15.
    const groupBuyItem: GroupBuyProgressItem = {
      product_id: product.id,
      product_name: product.name,
      total_quantity: 4,
      confirmed_quantity: 0,
      order_count: 2,
      cancelled_quantity: 0,
      cap_quantity: null,
      variations: [
        { variation_id: 'var-1', variation_name: '5mg', total_quantity: 3, cap_quantity: 10 },
        { variation_id: 'var-2', variation_name: '10mg', total_quantity: 1, cap_quantity: 5 },
      ],
    };

    renderCard({ product, groupBuyItem });

    // The shopper sees the pooled remaining so they know slots are still open.
    expect(screen.getByText(/11 left/i)).toBeInTheDocument();
    expect(screen.getByText(/4 \/ 15 reserved/i)).toBeInTheDocument();
  });

  it('falls back to the plain group-orders line when no variation is capped', () => {
    const product = {
      ...baseProduct,
      variations: [makeVariation({ id: 'var-1', name: '5mg' })],
    };
    const groupBuyItem: GroupBuyProgressItem = {
      product_id: product.id,
      product_name: product.name,
      total_quantity: 6,
      confirmed_quantity: 0,
      order_count: 3,
      cancelled_quantity: 0,
      cap_quantity: null,
      variations: [
        { variation_id: 'var-1', variation_name: '5mg', total_quantity: 6, cap_quantity: null },
      ],
    };

    renderCard({ product, groupBuyItem });

    expect(screen.queryByText(/left/i)).not.toBeInTheDocument();
    expect(screen.getByText(/6 reserved/i)).toBeInTheDocument();
  });
});
