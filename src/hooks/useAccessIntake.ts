import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ACCESS_REQUESTS_OPEN_KEY } from '../utils/access';

export interface AccessIntakeState {
  /** True while new paid access requests are accepted; false when intake is closed. */
  isIntakeOpen: boolean;
  /** True until the setting has been read once. */
  loading: boolean;
  /** Admin-only: open or close request intake by upserting the site_settings flag. */
  setIntakeOpen: (open: boolean) => Promise<void>;
}

/**
 * Reads (and, for admins, writes) the `access_requests_open` flag that gates new
 * paid access requests. Intake is treated as OPEN unless the stored value is the
 * exact string 'false', so a missing key or a read error never accidentally locks
 * everyone out — the BEFORE INSERT trigger on access_requests is the authoritative
 * gate, this hook only drives UX.
 */
export function useAccessIntake(): AccessIntakeState {
  const [isIntakeOpen, setIsIntakeOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('site_settings')
          .select('value')
          .eq('id', ACCESS_REQUESTS_OPEN_KEY)
          .maybeSingle();

        if (error) throw error;
        if (active) setIsIntakeOpen(data?.value !== 'false');
      } catch (err) {
        // Fail open: the server-side trigger still blocks inserts when closed.
        console.error('Error loading access intake setting:', err);
        if (active) setIsIntakeOpen(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const setIntakeOpen = useCallback(async (open: boolean) => {
    const value = open ? 'true' : 'false';
    const { error } = await supabase.from('site_settings').upsert({
      id: ACCESS_REQUESTS_OPEN_KEY,
      value,
      type: 'boolean',
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
    setIsIntakeOpen(open);
  }, []);

  return { isIntakeOpen, loading, setIntakeOpen };
}
