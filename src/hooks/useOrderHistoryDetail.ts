import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getActionErrorMessage } from '../utils/errorMessage';
import type { OrderHistoryRow } from '../types';

/**
 * Loads the DETAILED order history for one customer.
 *
 * Not to be confused with useOrderHistory, which is the localStorage list of
 * order numbers placed on this device. This one talks to the server and returns
 * the customer's own personal and checkout data.
 *
 * Two entry points, matching the two ways the tracking page identifies someone:
 *   loadByEmail        — the customer typed their address.
 *   loadByOrderNumber  — the customer typed an order number. The email goes with
 *                        it: order numbers come from a monotonic sequence, so the
 *                        number alone is guessable, and the RPC refuses to return
 *                        an address and phone to a lookup that only has one.
 */
export interface OrderHistoryDetailState {
  rows: OrderHistoryRow[];
  loading: boolean;
  error: string | null;
  loadByEmail: (email: string) => Promise<void>;
  loadByOrderNumber: (orderNumber: string, email: string) => Promise<void>;
  reset: () => void;
}

/**
 * Postgres hands back JSONB columns as-is, and an order with no items or no
 * recorded events can arrive as null. Every consumer maps over these, so they
 * are normalized once here rather than guarded at each call site.
 */
function normalize(row: OrderHistoryRow): OrderHistoryRow {
  return {
    ...row,
    order_items: Array.isArray(row.order_items) ? row.order_items : [],
    status_events: Array.isArray(row.status_events) ? row.status_events : [],
  };
}

export function useOrderHistoryDetail(): OrderHistoryDetailState {
  const [rows, setRows] = useState<OrderHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: string, params: Record<string, string>) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(fn, params);
        if (rpcError) {
          // Surface the real reason — Supabase errors are plain objects, not
          // Error instances, and a generic message hides the actual cause.
          setError(getActionErrorMessage(rpcError, 'We could not load your order history.'));
          setRows([]);
          return;
        }
        setRows(((data as OrderHistoryRow[] | null) ?? []).map(normalize));
      } catch (caught) {
        setError(getActionErrorMessage(caught, 'We could not load your order history.'));
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadByEmail = useCallback(
    async (email: string) => {
      // Normalized the same way checkout stores it, so the RPC's match lands.
      const normalized = email.trim().toLowerCase();
      if (!normalized) return;
      await run('get_order_history_by_email', { p_email: normalized });
    },
    [run],
  );

  const loadByOrderNumber = useCallback(
    async (orderNumber: string, email: string) => {
      const number = orderNumber.trim();
      const normalized = email.trim().toLowerCase();
      if (!number || !normalized) return;
      await run('get_order_history_by_number', {
        p_order_number: number,
        p_email: normalized,
      });
    },
    [run],
  );

  const reset = useCallback(() => {
    setRows([]);
    setError(null);
  }, []);

  return { rows, loading, error, loadByEmail, loadByOrderNumber, reset };
}
