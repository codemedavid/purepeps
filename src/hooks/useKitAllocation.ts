import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getActionErrorMessage } from '../utils/errorMessage';
import type { KitAllocationPreview } from '../types';

/**
 * Drives the admin's kit-allocation preview / lock / recalculate cycle for one
 * group-buy batch.
 *
 * `locked` is read from the persisted allocation rows rather than inferred from
 * whether a lock call has happened in this session: the admin who locked the
 * batch may have been someone else, yesterday.
 */
export function useKitAllocation(batchId: string | null) {
  const [preview, setPreview] = useState<KitAllocationPreview | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readLockState = useCallback(async () => {
    if (!batchId) return;
    const { data, error: queryError } = await supabase
      .from('group_buy_kit_allocations')
      .select('id')
      .eq('batch_id', batchId)
      .eq('status', 'locked')
      .limit(1);

    // Surfaced, not swallowed. Failing quietly here leaves `locked` false, so
    // the panel offers "Lock allocation" for a batch that may already be
    // locked — and the admin then meets an unexplained "already has a locked
    // kit allocation" error from the RPC with no trace of the real cause.
    if (queryError) {
      setError(
        getActionErrorMessage(
          queryError,
          'Could not check whether this allocation is already locked.',
        ),
      );
      return;
    }

    setLocked((data ?? []).length > 0);
  }, [batchId]);

  useEffect(() => {
    setPreview(null);
    setLocked(false);
    setError(null);
    void readLockState();
  }, [batchId, readLockState]);

  /** Runs one RPC, surfacing its error rather than leaving a stale preview up. */
  const run = useCallback(
    async (fn: string, args: Record<string, unknown>, fallback: string) => {
      if (!batchId) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(fn, args);
        if (rpcError) throw rpcError;
        setPreview((data ?? null) as KitAllocationPreview | null);
        await readLockState();
      } catch (err) {
        setError(getActionErrorMessage(err, fallback));
      } finally {
        setLoading(false);
      }
    },
    [batchId, readLockState],
  );

  const previewAllocation = useCallback(
    () =>
      run('preview_kit_allocation', { p_batch_id: batchId }, 'Could not preview the allocation.'),
    [run, batchId],
  );

  const lockAllocation = useCallback(
    () => run('lock_kit_allocation', { p_batch_id: batchId }, 'Could not lock the allocation.'),
    [run, batchId],
  );

  const recalculateAllocation = useCallback(
    () =>
      run(
        'recalculate_kit_allocation',
        // The confirmation the RPC demands. The UI has already asked the admin;
        // this is the explicit acknowledgement travelling with the request.
        { p_batch_id: batchId, p_confirm: true },
        'Could not recalculate the allocation.',
      ),
    [run, batchId],
  );

  return {
    preview,
    locked,
    loading,
    error,
    previewAllocation,
    lockAllocation,
    recalculateAllocation,
  };
}

export default useKitAllocation;
