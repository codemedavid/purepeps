import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { GroupBuyProgress } from '../types';

const EMPTY_PROGRESS: GroupBuyProgress = { batch: null, items: [] };

/** How often an open storefront re-reads batch status without a full page reload. */
export const GROUP_BUY_PROGRESS_POLL_MS = 30_000;

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
  const fetchGeneration = useRef(0);

  // `silent` skips the loading flip so poll/focus refetches don't flash the UI;
  // the visible counts only swap once fresh data resolves.
  const fetchProgress = useCallback(async (silent = false) => {
    const generation = ++fetchGeneration.current;
    try {
      if (!silent) setLoading(true);
      const { data, error: rpcError } = await supabase.rpc('get_group_buy_progress');
      if (generation !== fetchGeneration.current) return;
      if (rpcError) throw rpcError;

      const parsed = (data ?? EMPTY_PROGRESS) as GroupBuyProgress;
      setProgress({
        batch: parsed.batch ?? null,
        items: Array.isArray(parsed.items) ? parsed.items : [],
      });
      setError(null);
    } catch (err) {
      if (generation !== fetchGeneration.current) return;
      console.error('Error fetching group buy progress:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch group buy progress');
      // A poll/focus blip must not flash the storefront closed; keep the last
      // good snapshot. The initial fetch has nothing to keep, so it falls back.
      if (!silent) setProgress(EMPTY_PROGRESS);
    } finally {
      if (!silent && generation === fetchGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProgress();

    // Counts come from a SECURITY DEFINER aggregate RPC. group_buy_batches is
    // admin-only RLS, so shoppers cannot receive postgres_changes — poll and
    // tab-focus refetch keep "Group Buy · closed" current without a reload.
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void fetchProgress(true);
    };
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    const poll = window.setInterval(refreshIfVisible, GROUP_BUY_PROGRESS_POLL_MS);

    return () => {
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.clearInterval(poll);
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
