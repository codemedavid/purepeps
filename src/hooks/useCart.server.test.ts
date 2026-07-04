import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCart } from './useCart';
import type { Product } from '../types';

// The server cart talks to Supabase through these thin RPC wrappers; mock them
// so the hook's sync behavior can be asserted without a live backend.
const fetchMemberCart = vi.fn();
const persistMemberCart = vi.fn();
vi.mock('../utils/memberCartApi', () => ({
  fetchMemberCart: (...args: unknown[]) => fetchMemberCart(...args),
  persistMemberCart: (...args: unknown[]) => persistMemberCart(...args),
}));

function product(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: id,
    description: '',
    category: 'cat-1',
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

const catalog = [product('prod-1'), product('prod-2')];

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  fetchMemberCart.mockResolvedValue([]);
  persistMemberCart.mockResolvedValue(undefined);
});

describe('useCart server sync', () => {
  it('never touches the server while unverified', async () => {
    const { result } = renderHook(() => useCart());

    act(() => {
      result.current.addToCart(product('prod-1'), undefined, 2);
    });

    // Give any stray effects a chance to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMemberCart).not.toHaveBeenCalled();
    expect(persistMemberCart).not.toHaveBeenCalled();
  });

  it('loads and unions the server cart when a member is verified', async () => {
    localStorage.setItem(
      'peptide_cart',
      JSON.stringify([{ product: product('prod-1'), quantity: 2 }]),
    );
    fetchMemberCart.mockResolvedValue([{ product_id: 'prod-2', variation_id: null, quantity: 3 }]);

    const { result } = renderHook(() => useCart({ email: 'member@example.com', products: catalog }));

    await waitFor(() => expect(result.current.cartItems).toHaveLength(2));
    const ids = result.current.cartItems.map((i) => i.product.id).sort();
    expect(ids).toEqual(['prod-1', 'prod-2']);
    expect(fetchMemberCart).toHaveBeenCalledWith('member@example.com');
  });

  it('keeps the higher quantity when a line exists both locally and on the server', async () => {
    localStorage.setItem(
      'peptide_cart',
      JSON.stringify([{ product: product('prod-1'), quantity: 2 }]),
    );
    fetchMemberCart.mockResolvedValue([{ product_id: 'prod-1', variation_id: null, quantity: 5 }]);

    const { result } = renderHook(() => useCart({ email: 'member@example.com', products: catalog }));

    await waitFor(() => expect(result.current.cartItems).toHaveLength(1));
    expect(result.current.cartItems[0].quantity).toBe(5);
  });

  it('persists to the server when the cart changes while verified', async () => {
    const { result } = renderHook(() => useCart({ email: 'member@example.com', products: catalog }));
    // Let the initial load/merge settle first.
    await waitFor(() => expect(fetchMemberCart).toHaveBeenCalled());

    act(() => {
      result.current.addToCart(product('prod-1'), undefined, 2);
    });

    await waitFor(() =>
      expect(persistMemberCart).toHaveBeenCalledWith(
        'member@example.com',
        expect.arrayContaining([{ product_id: 'prod-1', variation_id: null, quantity: 2 }]),
      ),
    );
  });

  it('clears the server cart when the cart is cleared', async () => {
    localStorage.setItem(
      'peptide_cart',
      JSON.stringify([{ product: product('prod-1'), quantity: 2 }]),
    );
    const { result } = renderHook(() => useCart({ email: 'member@example.com', products: catalog }));
    await waitFor(() => expect(result.current.cartItems.length).toBeGreaterThan(0));

    act(() => {
      result.current.clearCart();
    });

    await waitFor(() => expect(persistMemberCart).toHaveBeenLastCalledWith('member@example.com', []));
    expect(result.current.cartItems).toHaveLength(0);
  });
});
