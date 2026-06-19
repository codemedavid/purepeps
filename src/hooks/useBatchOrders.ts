import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { BatchOrder, OrderLineItem } from '../types';

interface TrackingInput {
  tracking_number: string | null;
  shipping_provider: string | null;
  shipping_note: string | null;
}

/**
 * Admin-side management of every order inside a single group-buy batch (root
 * orders plus their claim add-ons). All writes go through the orders table under
 * the admin RLS policy. Group-buy confirms are pre-orders against a cap, NOT
 * against inventory, so confirming here NEVER deducts product stock — that is the
 * key behavioral difference from the normal storefront order flow.
 *
 * State is updated immutably; every mutation rethrows so callers can surface the
 * DB message in the UI.
 */
export function useBatchOrders(batchId: string | null) {
  const [orders, setOrders] = useState<BatchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!batchId) {
      setOrders([]);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('group_buy_batch_id', batchId)
        .order('is_claim')
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setOrders((data ?? []) as BatchOrder[]);
      setError(null);
    } catch (err) {
      console.error('Error loading batch orders:', err);
      setError(err instanceof Error ? err.message : 'Failed to load batch orders');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(async () => {
    await load();
  }, [load]);

  // Merge a partial server-confirmed patch into local state immutably.
  const patchOrder = useCallback((orderId: string, patch: Partial<BatchOrder>) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, ...patch } : order)),
    );
  }, []);

  // Group-buy confirm: mark confirmed + paid. Deliberately NO stock check and NO
  // stock deduction — pre-orders are capped, not inventory-backed.
  const confirmOrder = useCallback(
    async (order: BatchOrder): Promise<void> => {
      try {
        const updatedAt = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            order_status: 'confirmed',
            payment_status: 'paid',
            updated_at: updatedAt,
          })
          .eq('id', order.id);
        if (updateError) throw updateError;
        patchOrder(order.id, {
          order_status: 'confirmed',
          payment_status: 'paid',
          updated_at: updatedAt,
        });
      } catch (err) {
        console.error('Error confirming batch order:', err);
        throw err;
      }
    },
    [patchOrder],
  );

  const updateStatus = useCallback(
    async (orderId: string, status: string): Promise<void> => {
      try {
        const updatedAt = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('orders')
          .update({ order_status: status, updated_at: updatedAt })
          .eq('id', orderId);
        if (updateError) throw updateError;
        patchOrder(orderId, { order_status: status, updated_at: updatedAt });
      } catch (err) {
        console.error('Error updating batch order status:', err);
        throw err;
      }
    },
    [patchOrder],
  );

  const cancelOrder = useCallback(
    async (orderId: string): Promise<void> => {
      try {
        const updatedAt = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('orders')
          .update({ order_status: 'cancelled', updated_at: updatedAt })
          .eq('id', orderId);
        if (updateError) throw updateError;
        patchOrder(orderId, { order_status: 'cancelled', updated_at: updatedAt });
      } catch (err) {
        console.error('Error cancelling batch order:', err);
        throw err;
      }
    },
    [patchOrder],
  );

  const saveTracking = useCallback(
    async (orderId: string, tracking: TrackingInput): Promise<void> => {
      try {
        const updatedAt = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            tracking_number: tracking.tracking_number,
            shipping_provider: tracking.shipping_provider,
            shipping_note: tracking.shipping_note,
            updated_at: updatedAt,
          })
          .eq('id', orderId);
        if (updateError) throw updateError;
        patchOrder(orderId, {
          tracking_number: tracking.tracking_number,
          shipping_provider: tracking.shipping_provider,
          shipping_note: tracking.shipping_note,
          updated_at: updatedAt,
        });
      } catch (err) {
        console.error('Error saving batch order tracking:', err);
        throw err;
      }
    },
    [patchOrder],
  );

  // Edit the line items of an order. subtotal and total_price are both the sum of
  // line totals — total_price EXCLUDES shipping in this codebase (shipping_fee is
  // stored and applied separately). Appends an audit line to admin_notes.
  const saveItems = useCallback(
    async (orderId: string, items: OrderLineItem[]): Promise<void> => {
      try {
        const newTotal = items.reduce((sum, item) => sum + (item.total ?? 0), 0);
        const updatedAt = new Date().toISOString();
        const existing = orders.find((order) => order.id === orderId);
        const auditLine = `[${updatedAt}] Items edited by admin (${items.length} line item${
          items.length === 1 ? '' : 's'
        }, subtotal ${newTotal}).`;
        const nextNotes = existing?.admin_notes
          ? `${existing.admin_notes}\n${auditLine}`
          : auditLine;

        const { error: updateError } = await supabase
          .from('orders')
          .update({
            order_items: items,
            subtotal: newTotal,
            total_price: newTotal,
            admin_notes: nextNotes,
            updated_at: updatedAt,
          })
          .eq('id', orderId);
        if (updateError) throw updateError;
        patchOrder(orderId, {
          order_items: items,
          subtotal: newTotal,
          total_price: newTotal,
          admin_notes: nextNotes,
          updated_at: updatedAt,
        });
      } catch (err) {
        console.error('Error saving batch order items:', err);
        throw err;
      }
    },
    [orders, patchOrder],
  );

  const bulkUpdateStatus = useCallback(
    async (orderIds: string[], status: string): Promise<void> => {
      if (orderIds.length === 0) return;
      try {
        const updatedAt = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('orders')
          .update({ order_status: status, updated_at: updatedAt })
          .in('id', orderIds);
        if (updateError) throw updateError;
        const idSet = new Set(orderIds);
        setOrders((prev) =>
          prev.map((order) =>
            idSet.has(order.id)
              ? { ...order, order_status: status, updated_at: updatedAt }
              : order,
          ),
        );
      } catch (err) {
        console.error('Error bulk updating batch order status:', err);
        throw err;
      }
    },
    [],
  );

  return {
    orders,
    loading,
    error,
    reload,
    confirmOrder,
    updateStatus,
    cancelOrder,
    saveTracking,
    saveItems,
    bulkUpdateStatus,
  };
}
