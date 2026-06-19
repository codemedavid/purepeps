import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { GroupBuyRemaining, GroupBuyRemainingItem } from '../types';

interface ClaimItem {
  product_id: string;
  quantity: number;
}

interface SubmitClaimInput {
  orderNumber: string;
  email: string;
  items: ClaimItem[];
  paymentProofUrl?: string | null;
  paymentMethodId?: string | null;
  paymentMethodName?: string | null;
}

interface ClaimResult {
  order_id: string;
  order_number: string;
  parent_order_number: string | null;
  total: number;
}

/**
 * Customer-side group-buy leftover claiming. `fetchRemaining` lists the PII-free
 * per-product surplus available while a batch is finalizing; `submitClaim` files
 * an add-on claim against an existing order via the anon-callable RPC. Errors are
 * rethrown with the DB message so the form can surface it.
 */
export function useGroupBuyClaims() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRemaining = useCallback(
    async (batchId: string): Promise<GroupBuyRemainingItem[]> => {
      const { data, error: rpcError } = await supabase.rpc('get_group_buy_remaining', {
        p_batch_id: batchId,
      });
      if (rpcError) throw rpcError;
      const parsed = (data ?? null) as GroupBuyRemaining | null;
      return Array.isArray(parsed?.items) ? parsed.items : [];
    },
    [],
  );

  const submitClaim = useCallback(async (input: SubmitClaimInput): Promise<ClaimResult> => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('claim_group_buy_leftover', {
        p_order_number: input.orderNumber,
        p_email: input.email,
        p_items: input.items,
        p_payment_proof_url: input.paymentProofUrl ?? null,
        p_payment_method_id: input.paymentMethodId ?? null,
        p_payment_method_name: input.paymentMethodName ?? null,
      });
      if (rpcError) throw rpcError;
      if (!data) throw new Error('Claim failed: no result returned');
      return data as ClaimResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit claim';
      console.error('Error submitting group-buy claim:', err);
      setError(message);
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, fetchRemaining, submitClaim };
}
