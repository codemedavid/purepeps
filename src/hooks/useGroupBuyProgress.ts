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

  // `silent` skips the loading flip so realtime refetches don't flash the UI;
  // the visible counts only swap once fresh data resolves.
  const fetchProgress = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProgress();

    // Counts come from a SECURITY DEFINER aggregate RPC (orders rows are private,
    // so postgres_changes can't stream them to shoppers). Refetch whenever the tab
    // regains focus so every open page shows current per-item totals on return.
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') fetchProgress(true);
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);

    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
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
