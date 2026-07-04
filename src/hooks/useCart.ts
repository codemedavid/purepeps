import { useState, useEffect, useRef } from 'react';
import { resolveMinOrder } from '../constants/order';
import { mergeCarts, rehydrateCart, serializeCart } from '../utils/cart';
import { fetchMemberCart, persistMemberCart } from '../utils/memberCartApi';
import type { CartItem, Product, ProductVariation } from '../types';

const CART_STORAGE_KEY = 'peptide_cart';

// Debounce server writes so a burst of quantity taps collapses into one save.
const CART_SYNC_DEBOUNCE_MS = 500;

export interface UseCartOptions {
  /** Verified member email; enables server-backed persistence when set. */
  email?: string | null;
  /** Live catalog, used to rebuild the server cart's references into cart lines. */
  products?: Product[];
}

// Read the persisted cart synchronously so it is available on the first render.
// Loading via an effect instead lets the save effect fire once with the initial
// empty array and clobber the stored cart before the load lands.
function loadCartFromStorage(): CartItem[] {
  const savedCart = localStorage.getItem(CART_STORAGE_KEY);
  if (!savedCart) {
    return [];
  }

  try {
    const parsed = JSON.parse(savedCart);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error loading cart from localStorage:', error);
    return [];
  }
}

export function useCart(options?: UseCartOptions) {
  const email = options?.email ?? null;
  const products = options?.products;

  const [cartItems, setCartItems] = useState<CartItem[]>(loadCartFromStorage);
  const isInitialRender = useRef(true);
  // The email whose server cart we've already loaded — dedupes the load effect
  // (which re-runs as the catalog identity churns) and gates server writes so a
  // pre-load render can't overwrite the server with a not-yet-merged local cart.
  const startedEmailRef = useRef<string | null>(null);
  const loadedEmailRef = useRef<string | null>(null);

  // Persist the cart whenever it changes, skipping the initial mount so the
  // freshly loaded cart is never overwritten by a redundant write.
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

  // On verify, pull the member's server cart and UNION it with the local cart
  // (higher quantity wins), so items added on another device — or surviving a
  // localStorage eviction — reappear without clobbering anything added here.
  useEffect(() => {
    if (!email || !products || products.length === 0) return;
    if (startedEmailRef.current === email) return;
    startedEmailRef.current = email;

    let active = true;
    (async () => {
      const stored = await fetchMemberCart(email);
      if (!active) return;
      const serverItems = rehydrateCart(stored, products);
      setCartItems((prev) => mergeCarts(prev, serverItems));
      loadedEmailRef.current = email;
    })();

    return () => {
      active = false;
    };
  }, [email, products]);

  // Mirror cart changes to the server once the initial load/merge for this email
  // has completed. Debounced so rapid edits collapse into a single write.
  useEffect(() => {
    if (!email || loadedEmailRef.current !== email) return;
    const handle = window.setTimeout(() => {
      void persistMemberCart(email, serializeCart(cartItems));
    }, CART_SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [cartItems, email]);

  const addToCart = (product: Product, variation?: ProductVariation, quantity: number = 1) => {
    // Check stock availability
    const availableStock = variation ? variation.stock_quantity : product.stock_quantity;

    if (availableStock === 0) {
      alert(`Sorry, ${product.name}${variation ? ` ${variation.name}` : ''} is out of stock.`);
      return;
    }

    // Find existing item matching product and variation
    const existingItemIndex = cartItems.findIndex(
      item => item.product.id === product.id &&
        (variation ? item.variation?.id === variation.id : !item.variation)
    );

    if (existingItemIndex > -1) {
      // Update existing item - check if new total exceeds stock
      const currentQuantity = cartItems[existingItemIndex].quantity;
      const newQuantity = currentQuantity + quantity;

      if (newQuantity > availableStock) {
        const remainingStock = availableStock - currentQuantity;
        if (remainingStock > 0) {
          alert(`Only ${remainingStock} item(s) available in stock. Added ${remainingStock} to your cart.`);
          quantity = remainingStock;
        } else {
          alert(`Sorry, you already have the maximum available quantity (${currentQuantity}) in your cart.`);
          return;
        }
      }

      const updatedItems = [...cartItems];
      updatedItems[existingItemIndex].quantity += quantity;
      setCartItems(updatedItems);
    } else {
      // Add new item - enforce the per-product minimum order, then check stock
      quantity = Math.max(quantity, resolveMinOrder(product, variation));

      if (quantity > availableStock) {
        alert(`Only ${availableStock} item(s) available in stock. Added ${availableStock} to your cart.`);
        quantity = availableStock;
      }

      const newItem: CartItem = {
        product,
        variation,
        quantity
      };
      setCartItems([...cartItems, newItem]);
    }
  };

  const updateQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(index);
      return;
    }

    // Keep the line at or above its resolved minimum order
    const item = cartItems[index];
    const minOrder = resolveMinOrder(item.product, item.variation);
    if (quantity < minOrder) {
      quantity = minOrder;
    }

    // Check stock availability
    const availableStock = item.variation ? item.variation.stock_quantity : item.product.stock_quantity;

    if (quantity > availableStock) {
      alert(`Only ${availableStock} item(s) available in stock.`);
      quantity = availableStock;
    }

    const updatedItems = [...cartItems];
    updatedItems[index].quantity = quantity;
    setCartItems(updatedItems);
  };

  const removeFromCart = (index: number) => {
    const updatedItems = cartItems.filter((_, i) => i !== index);
    setCartItems(updatedItems);
  };

  const clearCart = () => {
    setCartItems([]);
    localStorage.removeItem(CART_STORAGE_KEY);
  };

  const getTotalPrice = () => {
    return cartItems.reduce((total, item) => {
      const price = item.variation ? item.variation.price : (item.product.discount_active && item.product.discount_price ? item.product.discount_price : item.product.base_price);
      return total + (price * item.quantity);
    }, 0);
  };

  const getTotalItems = () => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  };

  return {
    cartItems,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    getTotalPrice,
    getTotalItems
  };
}
