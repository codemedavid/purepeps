import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCart } from './useCart';
import { MIN_ORDER_QUANTITY } from '../constants/order';
import type { Product, ProductVariation } from '../types';

const mockProduct: Product = {
  id: 'prod-1',
  name: 'BPC-157',
  description: 'Recovery peptide',
  category: 'Recovery',
  base_price: 2500,
  discount_price: 2000,
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

const mockVariation: ProductVariation = {
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

describe('useCart', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  // --- Initialization ---

  describe('initialization', () => {
    it('starts with empty cart', () => {
      const { result } = renderHook(() => useCart());
      expect(result.current.cartItems).toEqual([]);
      expect(result.current.getTotalPrice()).toBe(0);
      expect(result.current.getTotalItems()).toBe(0);
    });

    it('loads cart from localStorage on mount', () => {
      const savedCart = [{ product: mockProduct, quantity: 2 }];
      localStorage.setItem('peptide_cart', JSON.stringify(savedCart));

      const { result } = renderHook(() => useCart());
      expect(result.current.cartItems).toHaveLength(1);
      expect(result.current.cartItems[0].quantity).toBe(2);
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('peptide_cart', 'not-valid-json{{{');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useCart());
      expect(result.current.cartItems).toEqual([]);
      consoleSpy.mockRestore();
    });
  });

  // --- addToCart ---

  describe('addToCart', () => {
    it('adds a product to cart with the minimum order quantity by default', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct);
      });

      expect(result.current.cartItems).toHaveLength(1);
      expect(result.current.cartItems[0].product.id).toBe('prod-1');
      expect(result.current.cartItems[0].quantity).toBe(MIN_ORDER_QUANTITY);
    });

    it('adds a product with specific quantity', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, undefined, 3);
      });

      expect(result.current.cartItems[0].quantity).toBe(3);
    });

    it('adds a product with variation', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, mockVariation);
      });

      expect(result.current.cartItems).toHaveLength(1);
      expect(result.current.cartItems[0].variation?.id).toBe('var-1');
    });

    it('increments quantity for existing item (same product, no variation)', () => {
      const { result } = renderHook(() => useCart());

      // First add starts a new line at the minimum (2); the second is additive (+1 default).
      act(() => {
        result.current.addToCart(mockProduct);
      });
      act(() => {
        result.current.addToCart(mockProduct);
      });

      expect(result.current.cartItems).toHaveLength(1);
      expect(result.current.cartItems[0].quantity).toBe(MIN_ORDER_QUANTITY + 1);
    });

    it('increments quantity for existing item (same product + variation)', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, mockVariation);
      });
      act(() => {
        result.current.addToCart(mockProduct, mockVariation);
      });

      expect(result.current.cartItems).toHaveLength(1);
      expect(result.current.cartItems[0].quantity).toBe(MIN_ORDER_QUANTITY + 1);
    });

    it('treats same product with different variations as separate items', () => {
      const variation2: ProductVariation = { ...mockVariation, id: 'var-2', name: '10mg', quantity_mg: 10, price: 2500, stock_quantity: 5 };
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, mockVariation);
      });
      act(() => {
        result.current.addToCart(mockProduct, variation2);
      });

      expect(result.current.cartItems).toHaveLength(2);
    });

    it('alerts and does not add when out of stock (product)', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const outOfStock = { ...mockProduct, stock_quantity: 0 };
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(outOfStock);
      });

      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('out of stock'));
      expect(result.current.cartItems).toHaveLength(0);
    });

    it('alerts and does not add when out of stock (variation)', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const outOfStockVar = { ...mockVariation, stock_quantity: 0 };
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, outOfStockVar);
      });

      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('out of stock'));
      expect(result.current.cartItems).toHaveLength(0);
    });

    it('caps quantity at stock limit for new item', () => {
      const limited = { ...mockProduct, stock_quantity: 2 };
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(limited, undefined, 5);
      });

      expect(result.current.cartItems[0].quantity).toBe(2);
    });

    it('caps quantity at stock limit when incrementing existing item', () => {
      const limited = { ...mockProduct, stock_quantity: 3 };
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(limited, undefined, 2);
      });
      act(() => {
        result.current.addToCart(limited, undefined, 5);
      });

      // Should cap at 3 total
      expect(result.current.cartItems[0].quantity).toBe(3);
    });

    it('alerts when max stock already in cart', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const limited = { ...mockProduct, stock_quantity: 1 };
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(limited);
      });
      act(() => {
        result.current.addToCart(limited);
      });

      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('maximum available quantity'));
    });
  });

  // --- minimum order quantity ---

  describe('minimum order quantity', () => {
    it('raises a below-minimum requested quantity up to the minimum for a new item', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, undefined, 1);
      });

      expect(result.current.cartItems[0].quantity).toBe(MIN_ORDER_QUANTITY);
    });

    it('keeps an above-minimum requested quantity unchanged', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, undefined, 4);
      });

      expect(result.current.cartItems[0].quantity).toBe(4);
    });

    it('clamps updateQuantity to the minimum instead of dropping below it', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, undefined, 3);
      });
      act(() => {
        result.current.updateQuantity(0, 1);
      });

      expect(result.current.cartItems[0].quantity).toBe(MIN_ORDER_QUANTITY);
    });
  });

  // --- updateQuantity ---

  describe('updateQuantity', () => {
    it('updates item quantity', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct);
      });
      act(() => {
        result.current.updateQuantity(0, 5);
      });

      expect(result.current.cartItems[0].quantity).toBe(5);
    });

    it('removes item when quantity is set to 0', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct);
      });
      act(() => {
        result.current.updateQuantity(0, 0);
      });

      expect(result.current.cartItems).toHaveLength(0);
    });

    it('removes item when quantity is negative', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct);
      });
      act(() => {
        result.current.updateQuantity(0, -1);
      });

      expect(result.current.cartItems).toHaveLength(0);
    });

    it('caps at stock limit', () => {
      const limited = { ...mockProduct, stock_quantity: 3 };
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(limited);
      });
      act(() => {
        result.current.updateQuantity(0, 10);
      });

      expect(result.current.cartItems[0].quantity).toBe(3);
    });

    it('respects variation stock limit', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, mockVariation); // variation stock: 5
      });
      act(() => {
        result.current.updateQuantity(0, 10);
      });

      expect(result.current.cartItems[0].quantity).toBe(5);
    });
  });

  // --- removeFromCart ---

  describe('removeFromCart', () => {
    it('removes an item by index', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct);
      });
      act(() => {
        result.current.removeFromCart(0);
      });

      expect(result.current.cartItems).toHaveLength(0);
    });

    it('removes the correct item when multiple exist', () => {
      const product2: Product = { ...mockProduct, id: 'prod-2', name: 'GHK-Cu' };
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct);
      });
      act(() => {
        result.current.addToCart(product2);
      });
      act(() => {
        result.current.removeFromCart(0);
      });

      expect(result.current.cartItems).toHaveLength(1);
      expect(result.current.cartItems[0].product.name).toBe('GHK-Cu');
    });
  });

  // --- clearCart ---

  describe('clearCart', () => {
    it('removes all items and results in empty cart', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct);
      });
      act(() => {
        result.current.clearCart();
      });

      expect(result.current.cartItems).toHaveLength(0);
      expect(result.current.getTotalItems()).toBe(0);
      expect(result.current.getTotalPrice()).toBe(0);
    });
  });

  // --- getTotalPrice ---

  describe('getTotalPrice', () => {
    it('returns 0 for empty cart', () => {
      const { result } = renderHook(() => useCart());
      expect(result.current.getTotalPrice()).toBe(0);
    });

    it('calculates total from base price', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, undefined, 2);
      });

      expect(result.current.getTotalPrice()).toBe(5000); // 2500 * 2
    });

    it('uses discount price when discount is active', () => {
      const discounted = { ...mockProduct, discount_active: true };
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(discounted); // floored to minimum quantity of 2
      });

      expect(result.current.getTotalPrice()).toBe(2000 * MIN_ORDER_QUANTITY); // discount_price
    });

    it('uses base price when discount is inactive even if discount_price exists', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct); // discount_active: false, floored to 2
      });

      expect(result.current.getTotalPrice()).toBe(2500 * MIN_ORDER_QUANTITY); // base_price
    });

    it('uses variation price when variation is present', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, mockVariation, 2);
      });

      expect(result.current.getTotalPrice()).toBe(3000); // 1500 * 2
    });

    it('sums across multiple items', () => {
      const product2: Product = { ...mockProduct, id: 'prod-2', base_price: 1000 };
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, undefined, 2); // 2500 * 2
      });
      act(() => {
        result.current.addToCart(product2, undefined, 3); // 1000 * 3
      });

      expect(result.current.getTotalPrice()).toBe(8000);
    });
  });

  // --- getTotalItems ---

  describe('getTotalItems', () => {
    it('returns 0 for empty cart', () => {
      const { result } = renderHook(() => useCart());
      expect(result.current.getTotalItems()).toBe(0);
    });

    it('counts total items across all entries', () => {
      const product2: Product = { ...mockProduct, id: 'prod-2' };
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct, undefined, 2);
      });
      act(() => {
        result.current.addToCart(product2, undefined, 3);
      });

      expect(result.current.getTotalItems()).toBe(5);
    });
  });

  // --- localStorage persistence ---

  describe('persistence', () => {
    it('saves cart to localStorage when items change', () => {
      const { result } = renderHook(() => useCart());

      act(() => {
        result.current.addToCart(mockProduct);
      });

      const saved = JSON.parse(localStorage.getItem('peptide_cart') || '[]');
      expect(saved).toHaveLength(1);
      expect(saved[0].product.id).toBe('prod-1');
    });
  });
});
