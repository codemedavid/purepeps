import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Tier } from '../utils/access';

interface RawLibraryTier {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  is_all_access: boolean;
}

/**
 * The full library of ACTIVE access tiers (admin-facing), read straight from the
 * tiers table rather than the batch-scoped get_access_tiers RPC. Used by the
 * open-batch modal to choose which tiers a new batch offers. Fetches only while
 * `enabled` (the modal is open) so it does no work in the background.
 */
export function useTierLibrary(enabled: boolean) {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('tiers')
        .select('id, name, description, price, is_all_access')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('price', { ascending: true });
      if (queryError) throw queryError;

      const rows = (data ?? []) as RawLibraryTier[];
      setTiers(
        rows.map((row) => {
          const price = row.price != null ? Number(row.price) : 0;
          return {
            id: row.id,
            name: row.name,
            description: row.description,
            price: Number.isFinite(price) ? price : 0,
            isAllAccess: Boolean(row.is_all_access),
            // The library picker only needs identity + price, not the category set.
            categoryIds: row.is_all_access ? null : [],
          };
        }),
      );
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load tiers';
      console.error('Error loading tier library:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  return { tiers, loading, error, refresh };
}
