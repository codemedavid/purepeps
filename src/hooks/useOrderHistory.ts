import { useCallback, useState } from 'react';

const STORAGE_KEY = 'peptide_orders';
const MAX_SAVED_ORDERS = 20;

export interface SavedOrder {
  orderNumber: string;
  total: number;
  itemSummary: string;
  placedAt: string; // ISO timestamp
}

function readSavedOrders(): SavedOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedOrder[]) : [];
  } catch (error) {
    console.error('Error loading saved orders:', error);
    return [];
  }
}

/**
 * Keeps a local list of order numbers the customer has placed on this device so
 * the tracking page can offer one-tap access to their order status. Stores only
 * the order reference and a short summary — the authoritative status always
 * comes from the server via the get_order_details RPC.
 */
export function useOrderHistory() {
  const [orders, setOrders] = useState<SavedOrder[]>(readSavedOrders);

  const addOrder = useCallback((order: SavedOrder) => {
    setOrders((previous) => {
      // Drop any existing entry for the same order number, then prepend the new
      // one so the most recent order is first. Cap the list to avoid unbounded
      // localStorage growth.
      const deduped = previous.filter((o) => o.orderNumber !== order.orderNumber);
      const next = [order, ...deduped].slice(0, MAX_SAVED_ORDERS);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.error('Error saving order history:', error);
      }
      return next;
    });
  }, []);

  const clearOrders = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setOrders([]);
    } catch (error) {
      console.error('Error clearing order history:', error);
    }
  }, []);

  return { orders, addOrder, clearOrders };
}
