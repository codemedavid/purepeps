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
  // stock deduction — pre-orders are capped, not inventory-backed. Records
  // paid_total as the current total so any later item edit can detect a balance.
  const confirmOrder = useCallback(
    async (order: BatchOrder): Promise<void> => {
      try {
        const updatedAt = new Date().toISOString();
        const patch = {
          order_status: 'confirmed',
          payment_status: 'paid',
          paid_total: order.total_price ?? 0,
          updated_at: updatedAt,
        };
        const { error: updateError } = await supabase
          .from('orders')
          .update(patch)
          .eq('id', order.id);
        if (updateError) throw updateError;
        patchOrder(order.id, patch);
      } catch (err) {
        console.error('Error confirming batch order:', err);
        throw err;
      }
    },
    [patchOrder],
  );

  // Admin confirms the customer paid the outstanding balance: mark fully paid and
  // advance paid_total to the current total so the balance clears.
  const verifyAdditionalPayment = useCallback(
    async (orderId: string): Promise<void> => {
      try {
        const updatedAt = new Date().toISOString();
        const existing = orders.find((order) => order.id === orderId);
        const patch = {
          payment_status: 'paid',
          paid_total: existing?.total_price ?? 0,
          updated_at: updatedAt,
        };
        const { error: updateError } = await supabase
          .from('orders')
          .update(patch)
          .eq('id', orderId);
        if (updateError) throw updateError;
        patchOrder(orderId, patch);
      } catch (err) {
        console.error('Error verifying additional payment:', err);
        throw err;
      }
    },
    [orders, patchOrder],
  );

  // Admin uploads the balance receipt on the customer's behalf (e.g. they sent it
  // over FB/WhatsApp). Stores the proof and marks it under review — the admin
  // still verifies separately, mirroring the customer self-serve path.
  const attachAdminPaymentProof = useCallback(
    async (orderId: string, proofUrl: string): Promise<void> => {
      try {
        const updatedAt = new Date().toISOString();
        const patch = {
          additional_payment_proof_url: proofUrl,
          payment_status: 'submitted',
          updated_at: updatedAt,
        };
        const { error: updateError } = await supabase
          .from('orders')
          .update(patch)
          .eq('id', orderId);
        if (updateError) throw updateError;
        patchOrder(orderId, patch);
      } catch (err) {
        console.error('Error attaching balance payment proof:', err);
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
  //
  // If the order was already paid and the new total exceeds what was paid, it
  // grows a BALANCE: payment_status drops back to 'pending' (balance due) and any
  // stale balance receipt is cleared, so the customer (or admin) supplies a fresh
  // receipt and an admin re-verifies. The paid baseline is paid_total, falling
  // back to the pre-edit total for orders paid before paid_total was tracked
  // (self-healing). Lowering the total never creates a balance.
  const saveItems = useCallback(
    async (orderId: string, items: OrderLineItem[]): Promise<void> => {
      try {
        const newTotal = items.reduce((sum, item) => sum + (item.total ?? 0), 0);
        const updatedAt = new Date().toISOString();
        const existing = orders.find((order) => order.id === orderId);

        const paidBaseline =
          existing?.paid_total ??
          (existing?.payment_status === 'paid' ? existing.total_price ?? 0 : null);
        const hasBalance = paidBaseline != null && newTotal > paidBaseline;

        const auditLine = hasBalance
          ? `[${updatedAt}] Items edited by admin (${items.length} line item${
              items.length === 1 ? '' : 's'
            }, subtotal ${newTotal}). Balance due ${newTotal - paidBaseline} — awaiting additional payment.`
          : `[${updatedAt}] Items edited by admin (${items.length} line item${
              items.length === 1 ? '' : 's'
            }, subtotal ${newTotal}).`;
        const nextNotes = existing?.admin_notes
          ? `${existing.admin_notes}\n${auditLine}`
          : auditLine;

        const patch: Partial<BatchOrder> & {
          order_items: OrderLineItem[];
          subtotal: number;
          total_price: number;
          admin_notes: string;
          updated_at: string;
        } = {
          order_items: items,
          subtotal: newTotal,
          total_price: newTotal,
          admin_notes: nextNotes,
          updated_at: updatedAt,
        };
        if (hasBalance) {
          patch.payment_status = 'pending';
          patch.additional_payment_proof_url = null;
          // Pin the baseline so the balance stays correct on subsequent edits.
          patch.paid_total = paidBaseline;
        }

        const { error: updateError } = await supabase
          .from('orders')
          .update(patch)
          .eq('id', orderId);
        if (updateError) throw updateError;
        patchOrder(orderId, patch);
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
        // Bulk-confirming must mirror the single-order confirm: mark paid too, so
        // payment_status never drifts out of sync with order_status. Like
        // confirmOrder, this is a pre-order against the cap — NO stock deduction.
        const patch: Partial<BatchOrder> & { order_status: string; updated_at: string } =
          status === 'confirmed'
            ? { order_status: status, payment_status: 'paid', updated_at: updatedAt }
            : { order_status: status, updated_at: updatedAt };
        const { error: updateError } = await supabase
          .from('orders')
          .update(patch)
          .in('id', orderIds);
        if (updateError) throw updateError;
        const idSet = new Set(orderIds);
        setOrders((prev) =>
          prev.map((order) => (idSet.has(order.id) ? { ...order, ...patch } : order)),
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
    verifyAdditionalPayment,
    attachAdminPaymentProof,
    updateStatus,
    cancelOrder,
    saveTracking,
    saveItems,
    bulkUpdateStatus,
  };
}
