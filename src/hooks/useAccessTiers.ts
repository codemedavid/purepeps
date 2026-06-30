import { supabase } from '../lib/supabase';
import { createSharedResource } from '../lib/sharedResource';
import { useSharedResource } from './useSharedResource';
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

async function fetchTiers(): Promise<Tier[]> {
  const { data, error } = await supabase.rpc('get_access_tiers');
  if (error) throw error;
  return ((data ?? []) as RawTier[]).map(normalizeTier);
}

// Module-level cache shared by every Get Access picker instance: the tiers RPC
// runs once, and the result is reused on subsequent mounts (no loading flash).
// While active, one realtime subscription live-updates the picker when an admin
// edits tiers or their categories.
//
// get_access_tiers is scoped to the OPEN batch's offered set (batch_tiers), so we
// must also refresh when a batch's offered tiers change or a new batch opens —
// otherwise the cached list goes stale (e.g. empty if it first loaded before the
// open batch had any tiers linked) and the picker shows nothing.
const tiersResource = createSharedResource<Tier[]>({
  fetcher: fetchTiers,
  initial: [],
  onActive: (refresh) => {
    const channel = supabase
      .channel('tiers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tiers' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tier_categories' }, () =>
        refresh(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_tiers' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_buy_batches' }, () =>
        refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },
});

/**
 * Active purchasable access tiers for the storefront Get Access picker, via the
 * PII-free get_access_tiers RPC. Each tier carries its price and the category
 * ids it unlocks (null for an all-access tier). Backed by a shared cache so the
 * picker is instant after the first load.
 */
export function useAccessTiers() {
  const { data: tiers, loading, error } = useSharedResource(tiersResource);
  return { tiers, loading, error, refresh: tiersResource.refresh };
}
