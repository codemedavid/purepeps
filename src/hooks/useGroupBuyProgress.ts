import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { GroupBuyProgress } from '../types';

const EMPTY_PROGRESS: GroupBuyProgress = { batch: null, items: [] };

/**
 * Storefront-facing group-buy progress. Reads the currently-open batch and its
 * per-product totals/caps through the public get_group_buy_progress RPC
 * (privacy-safe: aggregates only, never customer rows). Powers the customer cap
 * display ("78 / 100 reserved") and add-to-cart clamping, and tells the cart /
 * checkout whether a batch is open at all.
 */
export const useGroupBuyProgress = () => {
  const [progress, setProgress] = useState<GroupBuyProgress>(EMPTY_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: rpcError } = await supabase.rpc('get_group_buy_progress');
      if (rpcError) throw rpcError;

      const parsed = (data ?? EMPTY_PROGRESS) as GroupBuyProgress;
      setProgress({
        batch: parsed.batch ?? null,
        items: Array.isArray(parsed.items) ? parsed.items : [],
      });
      setError(null);
    } catch (err) {
      console.error('Error fetching group buy progress:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch group buy progress');
      setProgress(EMPTY_PROGRESS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return {
    progress,
    items: progress.items,
    batch: progress.batch,
    isBatchOpen: progress.batch?.status === 'open',
    loading,
    error,
    refresh: fetchProgress,
  };
};
