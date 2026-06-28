import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ACCESS_FEE_PHP, type AccessRequest, type AccessStatus } from '../utils/access';

export interface SubmitAccessInput {
  email: string;
  payment_method_id: string | null;
  payment_method_name: string | null;
  payment_proof_url: string | null;
  amount?: number;
  /** The tier the member is paying for. */
  tier_id?: string | null;
}

interface MutationResult {
  success: boolean;
  error?: string;
  data?: AccessRequest;
}

/**
 * Data access for paid group-buy access requests.
 * `submitRequest` is used by the public Get Access flow; `fetchAll` /
 * `updateStatus` power the admin approval view.
 */
export function useAccessRequests() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      // Embed the batch number (admin-only join) so the queue can show which
      // group buy each paid request unlocks.
      const { data, error: fetchError } = await supabase
        .from('access_requests')
        .select('*, group_buy_batches ( batch_number ), tiers ( name )')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      const rows = ((data ?? []) as (AccessRequest & {
        group_buy_batches?: { batch_number: number } | null;
        tiers?: { name: string } | null;
      })[]).map((row) => ({
        ...row,
        batch_number: row.group_buy_batches?.batch_number ?? null,
        tier_name: row.tiers?.name ?? null,
      }));
      setRequests(rows);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load access requests';
      console.error('Error loading access requests:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const submitRequest = useCallback(async (input: SubmitAccessInput): Promise<MutationResult> => {
    try {
      const payload = {
        email: input.email.trim().toLowerCase(),
        payment_method_id: input.payment_method_id,
        payment_method_name: input.payment_method_name,
        payment_proof_url: input.payment_proof_url,
        amount: input.amount ?? ACCESS_FEE_PHP,
        tier_id: input.tier_id ?? null,
        status: 'pending' as AccessStatus,
      };

      // No .select() here: the lockdown grants anon INSERT but not SELECT on
      // access_requests (reading rows back would leak other members' PII), so a
      // trailing RETURNING would fail. GetAccess only needs success/failure.
      const { error: insertError } = await supabase
        .from('access_requests')
        .insert(payload);

      if (insertError) throw insertError;
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit access request';
      console.error('Error submitting access request:', err);
      return { success: false, error: message };
    }
  }, []);

  const updateStatus = useCallback(
    async (id: string, status: AccessStatus): Promise<MutationResult> => {
      try {
        // Approvals are admin-only: the anon REST API can no longer change status
        // (RLS denies it). We go through the `approve-access` Edge Function, which
        // validates the caller's Supabase Auth JWT + admin membership server-side
        // before writing with the service role. supabase-js automatically attaches
        // the logged-in admin's access token to the invoke request.
        const { data, error: fnError } = await supabase.functions.invoke('approve-access', {
          body: { id, status },
        });

        if (fnError) {
          // supabase-js wraps non-2xx responses; the JSON body carries our message.
          let message = fnError.message;
          try {
            const body = await (fnError as { context?: Response }).context?.json?.();
            if (body?.error) message = body.error;
          } catch {
            // keep the wrapped message
          }
          throw new Error(message);
        }

        if (!data?.success) {
          throw new Error(data?.error ?? 'Failed to update access request');
        }

        const updated = data.data as AccessRequest;
        setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
        return { success: true, data: updated };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update access request';
        console.error('Error updating access request:', err);
        return { success: false, error: message };
      }
    },
    [],
  );

  useEffect(() => {
    // Admin view opts in by calling fetchAll(); no auto-fetch for the public flow.
  }, []);

  return { requests, loading, error, fetchAll, submitRequest, updateStatus };
}
