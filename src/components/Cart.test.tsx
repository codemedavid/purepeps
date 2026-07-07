import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Cart from './Cart';
import type { CartItem, GroupBuyProgressItem, Product, ProductVariation } from '../types';

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

function makeCartItem(overrides: Partial<CartItem> & { product?: Partial<Product> } = {}): CartItem {
  const { product, ...rest } = overrides;
  return {
    product: makeProduct(product),
    quantity: 1,
    ...rest,
  } as CartItem;
}

function progressItem(over: Partial<GroupBuyProgressItem> = {}): GroupBuyProgressItem {
  return {
    product_id: 'prod-1',
    product_name: 'BPC-157',
    total_quantity: 0,
    confirmed_quantity: 0,
    order_count: 0,
    cancelled_quantity: 0,
    cap_quantity: null,
    ...over,
  } as GroupBuyProgressItem;
}

const noop = () => {};

function renderCart(props: Partial<React.ComponentProps<typeof Cart>> = {}) {
  const defaults: React.ComponentProps<typeof Cart> = {
    cartItems: [],
    updateQuantity: noop,
    removeFromCart: noop,
    clearCart: noop,
    getTotalPrice: () => 0,
    onContinueShopping: noop,
    onCheckout: noop,
    isBatchOpen: true,
    groupBuyItems: [],
  };
  return render(<Cart {...defaults} {...props} />);
}

describe('Cart — group-buy availability', () => {
  it('lets the shopper check out when an available item sits beside a sold-out one', async () => {
    const user = userEvent.setup();
    const onCheckout = vi.fn();
    const available = makeCartItem({
      product: { id: 'ok', name: 'Available Peptide', base_price: 500 },
      quantity: 2,
    });
    const soldOut = makeCartItem({
      product: { id: 'sold', name: 'Filled Peptide', base_price: 999 },
      quantity: 1,
    });
    const groupBuyItems = [
      progressItem({ product_id: 'ok', cap_quantity: 10, total_quantity: 2 }),
      progressItem({ product_id: 'sold', cap_quantity: 4, total_quantity: 4 }),
    ];

    renderCart({ cartItems: [available, soldOut], groupBuyItems, onCheckout });

    const checkoutButton = screen.getByRole('button', { name: /proceed to checkout/i });
    expect(checkoutButton).toBeEnabled();

    await user.click(checkoutButton);
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it('flags the sold-out line as no longer available', () => {
    const available = makeCartItem({ product: { id: 'ok', name: 'Available Peptide' }, quantity: 1 });
    const soldOut = makeCartItem({ product: { id: 'sold', name: 'Filled Peptide' }, quantity: 1 });
    const groupBuyItems = [
      progressItem({ product_id: 'ok', cap_quantity: 10, total_quantity: 1 }),
      progressItem({ product_id: 'sold', cap_quantity: 4, total_quantity: 4 }),
    ];

    renderCart({ cartItems: [available, soldOut], groupBuyItems });

    expect(screen.getByText(/no longer available/i)).toBeInTheDocument();
  });

  it('excludes sold-out items from the order subtotal', () => {
    const available = makeCartItem({
      product: { id: 'ok', name: 'Available Peptide', base_price: 500 },
      quantity: 2,
    });
    const soldOut = makeCartItem({
      product: { id: 'sold', name: 'Filled Peptide', base_price: 999 },
      quantity: 3,
    });
    const groupBuyItems = [
      progressItem({ product_id: 'ok', cap_quantity: 10, total_quantity: 2 }),
      progressItem({ product_id: 'sold', cap_quantity: 4, total_quantity: 4 }),
    ];

    renderCart({ cartItems: [available, soldOut], groupBuyItems });

    // Only the available line (500 x 2 = 1000) counts — the sold-out 999 x 3 is dropped.
    expect(screen.getByText('₱1,000')).toBeInTheDocument();
    expect(screen.queryByText(/2,997/)).not.toBeInTheDocument();
  });

  it('disables checkout when every item is sold out', () => {
    const soldA = makeCartItem({ product: { id: 'a', name: 'A' }, quantity: 1 });
    const soldB = makeCartItem({ product: { id: 'b', name: 'B' }, quantity: 1 });
    const groupBuyItems = [
      progressItem({ product_id: 'a', cap_quantity: 1, total_quantity: 1 }),
      progressItem({ product_id: 'b', cap_quantity: 1, total_quantity: 1 }),
    ];

    renderCart({ cartItems: [soldA, soldB], groupBuyItems });

    expect(screen.getByRole('button', { name: /proceed to checkout/i })).toBeDisabled();
  });

  it('still blocks checkout for an available item that exceeds its remaining cap', () => {
    const overCap = makeCartItem({ product: { id: 'ok', name: 'Available Peptide' }, quantity: 5 });
    const groupBuyItems = [progressItem({ product_id: 'ok', cap_quantity: 10, total_quantity: 8 })]; // remaining 2

    renderCart({ cartItems: [overCap], groupBuyItems });

    expect(screen.getByRole('button', { name: /proceed to checkout/i })).toBeDisabled();
  });
});
