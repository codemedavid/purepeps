import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { TierPrice } from '../utils/access';

interface RawTierRow {
  id: string;
  name: string;
  price: number | string | null;
  is_all_access: boolean;
  sort_order: number | null;
}

/** A selectable tier for the admin corrector: price-check shape + all-access flag. */
export interface CatalogTier extends TierPrice {
  isAllAccess: boolean;
}

function normalize(raw: RawTierRow): CatalogTier {
  const price = raw.price != null ? Number(raw.price) : 0;
  return {
    id: raw.id,
    name: raw.name,
    price: Number.isFinite(price) ? price : 0,
    isAllAccess: Boolean(raw.is_all_access),
  };
}

/**
 * Every active tier (id, name, price, all-access) read straight from the `tiers`
 * table, which anon may SELECT. Unlike useAccessTiers this is NOT scoped to the
 * open batch's offered set, so the admin can price-check and correct requests on
 * any batch. Powers the mismatch flag and tier corrector in AccessRequestsManager.
 */
export function useTierCatalog() {
  const [tiers, setTiers] = useState<CatalogTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('tiers')
        .select('id, name, price, is_all_access, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('price', { ascending: true });
      if (fetchError) throw fetchError;
      setTiers(((data ?? []) as RawTierRow[]).map(normalize));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load tiers';
      console.error('Error loading tier catalog:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tiers, loading, error, refresh };
}
