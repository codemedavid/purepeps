import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type {
  FulfillmentStage,
  GroupBuyBatch,
  GroupBuyCap,
  GroupBuyProgress,
  GroupBuyRemaining,
  GroupBuyRemainingItem,
} from '../types';
import type { BatchTierOption, EditBatchValues } from '../components/groupbuy/EditBatchModal';

const EMPTY_PROGRESS: GroupBuyProgress = { batch: null, items: [] };

/** The editable settings of an existing batch (name, announced window, tiers). */
type BatchSettings = EditBatchValues;

/**
 * Admin-side group-buy operations. Batches and caps are read/written directly
 * (RLS restricts these tables to admins via is_admin()); open/close go through
 * the SECURITY DEFINER RPCs so opening atomically closes the previous batch and
 * cannot trip the one-open-batch unique index. Mirrors usePaymentMethods.
 */
export const useGroupBuy = () => {
  const [batches, setBatches] = useState<GroupBuyBatch[]>([]);
  const [activeBatch, setActiveBatch] = useState<GroupBuyBatch | null>(null);
  const [caps, setCaps] = useState<GroupBuyCap[]>([]);
  const [progress, setProgress] = useState<GroupBuyProgress>(EMPTY_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBatches = useCallback(async (): Promise<GroupBuyBatch[]> => {
    const { data, error: fetchError } = await supabase
      .from('group_buy_batches')
      .select('*')
      .order('batch_number', { ascending: false });
    if (fetchError) throw fetchError;

    const list = (data ?? []) as GroupBuyBatch[];
    setBatches(list);
    setActiveBatch(list.find((batch) => batch.status === 'open') ?? null);
    return list;
  }, []);

  const fetchCaps = useCallback(async (batchId: string) => {
    const { data, error: fetchError } = await supabase
      .from('group_buy_caps')
      .select('*')
      .eq('batch_id', batchId);
    if (fetchError) throw fetchError;
    setCaps((data ?? []) as GroupBuyCap[]);
  }, []);

  const fetchProgress = useCallback(async (batchId?: string) => {
    const { data, error: rpcError } = await supabase.rpc(
      'get_group_buy_progress',
      batchId ? { p_batch_id: batchId } : {},
    );
    if (rpcError) throw rpcError;
    const parsed = (data ?? EMPTY_PROGRESS) as GroupBuyProgress;
    setProgress({
      batch: parsed.batch ?? null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchBatches();
      const open = list.find((batch) => batch.status === 'open') ?? null;
      if (open) {
        await Promise.all([fetchCaps(open.id), fetchProgress(open.id)]);
      } else {
        setCaps([]);
        setProgress(EMPTY_PROGRESS);
      }
      setError(null);
    } catch (err) {
      console.error('Error loading group buy:', err);
      setError(err instanceof Error ? err.message : 'Failed to load group buy');
    } finally {
      setLoading(false);
    }
  }, [fetchBatches, fetchCaps, fetchProgress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Reconcile with server truth when the admin returns to the tab — another
  // admin or tab may have opened/closed a batch in the meantime, leaving this
  // view's activeBatch stale.
  useEffect(() => {
    const onFocus = () => {
      refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  // Access tiers default to the server's set (every active tier at its own
  // price): p_tier_ids is always null so open_group_buy_batch offers them all.
  const openBatch = useCallback(
    async (name?: string, startsAt?: string | null, endsAt?: string | null) => {
      const { error: rpcError } = await supabase.rpc('open_group_buy_batch', {
        p_name: name?.trim() ? name.trim() : null,
        p_starts_at: startsAt ?? null,
        p_ends_at: endsAt ?? null,
        p_tier_ids: null,
      });
      if (rpcError) throw rpcError;
      await refresh();
    },
    [refresh],
  );

  // Edit the announced window (starts_at / ends_at) on an existing batch.
  // Either bound may be null (open-ended start, or no deadline).
  const setSchedule = useCallback(
    async (batchId: string, startsAt: string | null, endsAt: string | null) => {
      const { error: rpcError } = await supabase.rpc('set_group_buy_schedule', {
        p_id: batchId,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
      });
      if (rpcError) throw rpcError;
      await refresh();
    },
    [refresh],
  );

  // Active tiers the admin may offer on a batch (id, name, price), ordered for
  // display. The storefront get_access_tiers RPC only returns the OPEN batch's
  // offered tiers, so the editor reads the full active set directly instead.
  const fetchOfferableTiers = useCallback(async (): Promise<BatchTierOption[]> => {
    const { data, error: fetchError } = await supabase
      .from('tiers')
      .select('id, name, price')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (fetchError) throw fetchError;
    return ((data ?? []) as Array<{ id: string; name: string; price: number | string | null }>).map(
      (row) => ({ id: row.id, name: row.name, price: Number(row.price ?? 0) }),
    );
  }, []);

  // Which tiers a batch currently offers (for seeding the editor's checkboxes).
  const fetchBatchTierIds = useCallback(async (batchId: string): Promise<string[]> => {
    const { data, error: fetchError } = await supabase
      .from('batch_tiers')
      .select('tier_id')
      .eq('group_buy_batch_id', batchId);
    if (fetchError) throw fetchError;
    return ((data ?? []) as Array<{ tier_id: string }>).map((row) => row.tier_id);
  }, []);

  // Edit an existing batch's settings without reopening it: name (direct admin
  // UPDATE, like setFulfillmentStage), announced window (set_group_buy_schedule),
  // and offered tiers (set_batch_tiers). One refresh reconciles afterwards.
  const updateBatchSettings = useCallback(
    async (batchId: string, settings: BatchSettings) => {
      const name = settings.name?.trim() ? settings.name.trim() : null;

      const { error: nameError } = await supabase
        .from('group_buy_batches')
        .update({ name })
        .eq('id', batchId);
      if (nameError) throw nameError;

      const { error: scheduleError } = await supabase.rpc('set_group_buy_schedule', {
        p_id: batchId,
        p_starts_at: settings.startsAt ?? null,
        p_ends_at: settings.endsAt ?? null,
      });
      if (scheduleError) throw scheduleError;

      const { error: tierError } = await supabase.rpc('set_batch_tiers', {
        p_batch_id: batchId,
        p_tier_ids: settings.tierIds,
      });
      if (tierError) throw tierError;

      await refresh();
    },
    [refresh],
  );

  const closeBatch = useCallback(
    async (id: string) => {
      const { error: rpcError } = await supabase.rpc('close_group_buy_batch', { p_id: id });
      if (rpcError) throw rpcError;
      await refresh();
    },
    [refresh],
  );

  // Lifecycle transitions: open -> finalizing -> finalized, with reopen as the
  // escape hatch back to open. SECURITY DEFINER RPCs enforce the legal state
  // machine server-side; we just trigger and reconcile via refresh().
  const startFinalizing = useCallback(
    async (batchId: string): Promise<void> => {
      const { error: rpcError } = await supabase.rpc('start_finalizing_batch', { p_id: batchId });
      if (rpcError) throw rpcError;
      await refresh();
    },
    [refresh],
  );

  const finalizeBatch = useCallback(
    async (batchId: string): Promise<void> => {
      const { error: rpcError } = await supabase.rpc('finalize_group_buy_batch', { p_id: batchId });
      if (rpcError) throw rpcError;
      await refresh();
    },
    [refresh],
  );

  const reopenBatch = useCallback(
    async (batchId: string): Promise<void> => {
      const { error: rpcError } = await supabase.rpc('reopen_group_buy_batch', { p_id: batchId });
      if (rpcError) throw rpcError;
      await refresh();
    },
    [refresh],
  );

  // Per-product leftover surplus for a finalizing batch (admin leftover panel).
  // Returns only the items array; the batch_status envelope is dropped here.
  const fetchBatchRemaining = useCallback(
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

  const setCap = useCallback(
    async (batchId: string, productId: string, capQuantity: number) => {
      const { error: upsertError } = await supabase
        .from('group_buy_caps')
        .upsert(
          {
            batch_id: batchId,
            product_id: productId,
            cap_quantity: capQuantity,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'batch_id,product_id' },
        );
      if (upsertError) throw upsertError;
      await Promise.all([fetchCaps(batchId), fetchProgress(batchId)]);
    },
    [fetchCaps, fetchProgress],
  );

  const removeCap = useCallback(
    async (batchId: string, productId: string) => {
      const { error: deleteError } = await supabase
        .from('group_buy_caps')
        .delete()
        .eq('batch_id', batchId)
        .eq('product_id', productId);
      if (deleteError) throw deleteError;
      await Promise.all([fetchCaps(batchId), fetchProgress(batchId)]);
    },
    [fetchCaps, fetchProgress],
  );

  // Advance (or reset) the shared international-leg stage for a whole batch.
  // One write moves every order in the batch forward on the customer tracking
  // page. Direct UPDATE under the group_buy_batches admin RLS policy.
  const setFulfillmentStage = useCallback(
    async (batchId: string, stage: FulfillmentStage | null) => {
      const { error: updateError } = await supabase
        .from('group_buy_batches')
        .update({ fulfillment_stage: stage })
        .eq('id', batchId);
      if (updateError) throw updateError;
      await refresh();
    },
    [refresh],
  );

  const fetchBatchOrders = useCallback(async (batchId: string) => {
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('group_buy_batch_id', batchId)
      .order('created_at', { ascending: false });
    if (fetchError) throw fetchError;
    return data ?? [];
  }, []);

  return {
    batches,
    activeBatch,
    caps,
    progress,
    loading,
    error,
    refresh,
    openBatch,
    setSchedule,
    fetchOfferableTiers,
    fetchBatchTierIds,
    updateBatchSettings,
    closeBatch,
    startFinalizing,
    finalizeBatch,
    reopenBatch,
    fetchBatchRemaining,
    setCap,
    removeCap,
    setFulfillmentStage,
    fetchProgress,
    fetchBatchOrders,
  };
};
