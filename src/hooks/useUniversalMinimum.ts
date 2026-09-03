import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getActionErrorMessage } from '../utils/errorMessage';
import {
  DEFAULT_UNIVERSAL_MINIMUM,
  UNIVERSAL_MINIMUM_SETTING_KEYS,
  universalMinimumFromRows,
  universalMinimumToRows,
  type MinimumOrderSettingRow,
  type UniversalMinimumOrder,
} from '../utils/minimumOrder';

export interface UniversalMinimumState {
  universal: UniversalMinimumOrder;
  /** True until the three settings have been read once. */
  loading: boolean;
  /** Last read failure, or null. The setting stays usable either way. */
  error: string | null;
  /** Admin-only: write all three rows. Throws if the write is refused. */
  save: (next: UniversalMinimumOrder) => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Reads (and, for admins, writes) the site-wide minimum order.
 *
 * All three rows travel in ONE round trip, mirroring `useFeatureFlags`.
 *
 * The failure direction is the opposite of that hook's, deliberately.
 * `useFeatureFlags` fails OPEN — a settings outage leaves every feature
 * visible, because blanking the navigation is worse than showing too much.
 * A minimum works the other way: if the setting cannot be read, enforce
 * NOTHING. Guessing at a minimum would start rejecting carts that are
 * perfectly valid, and a shopper cannot tell that from a real rule.
 */
export function useUniversalMinimum(): UniversalMinimumState {
  const [universal, setUniversal] = useState<UniversalMinimumOrder>(DEFAULT_UNIVERSAL_MINIMUM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error: readError } = await supabase
        .from('site_settings')
        .select('id,value')
        .in('id', [...UNIVERSAL_MINIMUM_SETTING_KEYS]);

      if (readError) throw readError;
      if (!isMounted.current) return;

      setUniversal(universalMinimumFromRows(data as MinimumOrderSettingRow[] | null));
      setError(null);
    } catch (err) {
      console.error('Error loading the universal minimum order:', err);
      if (!isMounted.current) return;
      // Enforce nothing rather than guess.
      setUniversal(DEFAULT_UNIVERSAL_MINIMUM);
      setError(getActionErrorMessage(err, 'load the universal minimum order'));
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void fetchSettings();
    return () => {
      isMounted.current = false;
    };
  }, [fetchSettings]);

  const save = useCallback(async (next: UniversalMinimumOrder) => {
    const timestamp = new Date().toISOString();

    const { error: writeError } = await supabase.from('site_settings').upsert(
      universalMinimumToRows(next).map((row) => ({
        ...row,
        type: row.id.endsWith('_enabled')
          ? 'boolean'
          : row.id.endsWith('_unit')
            ? 'text'
            : 'number',
        updated_at: timestamp,
      })),
    );

    if (writeError) throw new Error(writeError.message);

    // Only after the write lands. Optimistically showing the new quantity would
    // tell the admin a minimum is live that no shopper is subject to.
    setUniversal(next);
  }, []);

  return { universal, loading, error, save, refetch: fetchSettings };
}

export default useUniversalMinimum;
