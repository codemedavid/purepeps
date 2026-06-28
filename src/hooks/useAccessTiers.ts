import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Tier } from '../utils/access';

interface RawTier {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  is_all_access: boolean;
  category_ids: string[] | null;
}

function normalizeTier(raw: RawTier): Tier {
  const price = raw.price != null ? Number(raw.price) : 0;
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    price: Number.isFinite(price) ? price : 0,
    isAllAccess: Boolean(raw.is_all_access),
    categoryIds: raw.is_all_access ? null : raw.category_ids ?? [],
  };
}

/**
 * Active purchasable access tiers for the storefront Get Access picker, via the
 * PII-free get_access_tiers RPC. Each tier carries its price and the category
 * ids it unlocks (null for an all-access tier). Re-fetches on tier changes.
 */
export function useAccessTiers() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: rpcError } = await supabase.rpc('get_access_tiers');
      if (rpcError) throw rpcError;

      const raw = (data ?? []) as RawTier[];
      setTiers(raw.map(normalizeTier));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load access tiers';
      console.error('Error loading access tiers:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    // Live-update the picker when an admin edits tiers or their categories.
    const channel = supabase
      .channel('tiers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tiers' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tier_categories' }, () =>
        refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { tiers, loading, error, refresh };
}
