import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getActionErrorMessage } from '../utils/errorMessage';
import type { LigwakRecord } from '../types';
import type { LigwakRefundStatus } from '../constants/ligwak';

/**
 * Admin data layer for Ligwak records.
 *
 * Every write goes through an RPC rather than a direct table UPDATE. That is not
 * ceremony: the RPCs are what write the audit trail, and a plain UPDATE from the
 * client would move money with no record of who did it or why. RLS would permit
 * it — the audit obligation is the reason not to.
 */

export interface RecordRefundArgs {
  recordId: string;
  amount: number;
  reference: string | null;
  proofUrl: string | null;
  notes: string | null;
}

export interface SetRefundStatusArgs {
  recordId: string;
  status: LigwakRefundStatus;
  notes?: string | null;
}

interface LigwakRow extends Omit<LigwakRecord, 'batch_label'> {
  group_buy_batches?: { name: string | null; batch_number: number | null } | null;
}

/** "Batch 7 — August" from whichever of name/number the admin actually set. */
function batchLabel(row: LigwakRow): string | null {
  const batch = row.group_buy_batches;
  if (!batch) return null;
  const number = batch.batch_number != null ? `Batch ${batch.batch_number}` : null;
  if (number && batch.name) return `${number} — ${batch.name}`;
  return batch.name ?? number;
}

export function useLigwak(batchId?: string | null) {
  const [records, setRecords] = useState<LigwakRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('ligwak_records')
        .select('*, group_buy_batches(name, batch_number)')
        .order('ordered_at', { ascending: true });

      if (batchId) query = query.eq('batch_id', batchId);

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      setRecords(
        ((data ?? []) as LigwakRow[]).map((row) => ({
          ...row,
          batch_label: batchLabel(row),
        })),
      );
    } catch (err) {
      setError(getActionErrorMessage(err, 'Could not load the Ligwak records.'));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  const recordRefund = useCallback(
    async ({ recordId, amount, reference, proofUrl, notes }: RecordRefundArgs) => {
      const { error: rpcError } = await supabase.rpc('record_ligwak_refund', {
        p_record_id: recordId,
        p_amount: amount,
        p_reference: reference,
        p_proof_url: proofUrl,
        p_notes: notes,
      });
      if (rpcError) throw rpcError;
      await fetchRecords();
    },
    [fetchRecords],
  );

  const setRefundStatus = useCallback(
    async ({ recordId, status, notes = null }: SetRefundStatusArgs) => {
      const { error: rpcError } = await supabase.rpc('set_ligwak_refund_status', {
        p_record_id: recordId,
        p_status: status,
        p_notes: notes,
      });
      if (rpcError) throw rpcError;
      await fetchRecords();
    },
    [fetchRecords],
  );

  const notifyCustomers = useCallback(
    async (recordIds: string[]) => {
      if (recordIds.length === 0) return;
      const { error: rpcError } = await supabase.rpc('mark_ligwak_notified', {
        p_record_ids: recordIds,
      });
      if (rpcError) throw rpcError;
      await fetchRecords();
    },
    [fetchRecords],
  );

  return useMemo(
    () => ({
      records,
      loading,
      error,
      recordRefund,
      setRefundStatus,
      notifyCustomers,
      refresh: fetchRecords,
    }),
    [records, loading, error, recordRefund, setRefundStatus, notifyCustomers, fetchRecords],
  );
}

export default useLigwak;
