import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AccessRequest } from '../utils/access';

/** Subscriber statuses shown in a batch roster: paid-and-unlocked, plus paid-and-waiting. */
const ROSTER_STATUSES = ['approved', 'pending'] as const;

/**
 * Admin-side roster of every member who has subscribed to a single group-buy
 * batch — i.e. the paid access_requests for that batch (approved = unlocked,
 * pending = paid & awaiting review). Read directly under the admin SELECT policy
 * on access_requests, joined to the tier name for display. State is immutable;
 * `reload` re-fetches.
 */
export function useBatchMembers(batchId: string | null) {
  const [members, setMembers] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!batchId) {
      setMembers([]);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('access_requests')
        .select('*, tiers ( name )')
        .eq('group_buy_batch_id', batchId)
        .in('status', [...ROSTER_STATUSES])
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;

      const rows = ((data ?? []) as (AccessRequest & { tiers?: { name: string } | null })[]).map(
        (row) => ({ ...row, tier_name: row.tiers?.name ?? null }),
      );
      setMembers(rows);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load batch members';
      console.error('Error loading batch members:', err);
      setError(message);
      setMembers([]);
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

  return { members, loading, error, reload };
}
