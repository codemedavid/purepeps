import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ACCESS_FEE_PHP, type ActiveAccessInfo } from '../utils/access';

interface RawActiveAccessInfo {
  batch_number: number | null;
  access_fee: number | string | null;
  name: string | null;
}

const FALLBACK: ActiveAccessInfo = {
  batchNumber: null,
  accessFee: ACCESS_FEE_PHP,
  name: null,
};

/**
 * Open group-buy batch number + admin-set access fee, via the PII-free
 * get_active_access_info RPC. Powers the per-batch fee shown in GetAccess and
 * the "Batch N" label in the renewal prompt. Falls back to ACCESS_FEE_PHP while
 * loading or if no batch is open.
 */
export function useActiveAccess() {
  const [info, setInfo] = useState<ActiveAccessInfo>(FALLBACK);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_active_access_info');
      if (error) throw error;

      const raw = (data ?? null) as RawActiveAccessInfo | null;
      const fee = raw?.access_fee != null ? Number(raw.access_fee) : null;

      setInfo({
        batchNumber: raw?.batch_number ?? null,
        accessFee: Number.isFinite(fee) && fee !== null ? fee : ACCESS_FEE_PHP,
        name: raw?.name ?? null,
      });
    } catch (err) {
      console.error('Error loading active access info:', err);
      setInfo(FALLBACK);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { info, loading, refresh };
}
