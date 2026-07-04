import { useState, useEffect, useRef } from 'react';
import { MIN_ORDER_QUANTITY } from '../constants/order';
import type { CartItem, Product, ProductVariation } from '../types';

const CART_STORAGE_KEY = 'peptide_cart';

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

export function useCart() {
  const [cartItems, setCartItems] = useState<CartItem[]>(loadCartFromStorage);
  const isInitialRender = useRef(true);

  // Persist the cart whenever it changes, skipping the initial mount so the
  // freshly loaded cart is never overwritten by a redundant write.
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

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
      quantity = Math.max(quantity, MIN_ORDER_QUANTITY);

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

    // Keep the line at or above the per-product minimum order
    if (quantity < MIN_ORDER_QUANTITY) {
      quantity = MIN_ORDER_QUANTITY;
    }

    // Check stock availability
    const item = cartItems[index];
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
