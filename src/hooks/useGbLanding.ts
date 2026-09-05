import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_GB_LANDING,
  GB_LANDING_KEYS,
  gbLandingFromRows,
  gbLandingToRows,
  type GbLandingContent,
  type GbLandingSettingRow,
} from '../utils/gbLanding';
import { getActionErrorMessage } from '../utils/errorMessage';

export interface GbLandingState {
  /** Everything the public landing section renders. */
  content: GbLandingContent;
  /** True until the settings have been read once. */
  loading: boolean;
  /** Last read/write failure, or null. `content` stays usable either way. */
  error: string | null;
  /** Admin-only: write every field back in one upsert. */
  save: (next: GbLandingContent) => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Reads (and, for admins, writes) the Group Buy landing page content.
 *
 * All fields are fetched in ONE round trip. Reads FAIL OPEN — an error leaves
 * the built-in defaults on screen rather than an empty homepage — mirroring
 * `useFeatureFlags`. Writes touch only `site_settings`, never a content table,
 * so editing the landing page cannot affect products, batches or orders.
 */
export function useGbLanding(): GbLandingState {
  const [content, setContent] = useState<GbLandingContent>(DEFAULT_GB_LANDING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchContent = useCallback(async () => {
    try {
      const { data, error: readError } = await supabase
        .from('site_settings')
        .select('id,value')
        .in('id', [...GB_LANDING_KEYS]);

      if (readError) throw readError;
      if (!isMounted.current) return;

      setContent(gbLandingFromRows(data as GbLandingSettingRow[] | null));
      setError(null);
    } catch (err) {
      // Fail open: the homepage is the whole site here, so a settings outage
      // must show the defaults rather than nothing at all.
      console.error('Error loading GB landing settings:', err);
      if (!isMounted.current) return;
      setContent(DEFAULT_GB_LANDING);
      setError(getActionErrorMessage(err, 'load the Group Buy landing settings'));
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void fetchContent();

    // Live refresh is best-effort: if Realtime is not enabled for site_settings
    // an admin's edit still lands on the next page load.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('gb-landing-settings')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'site_settings' },
          () => {
            void fetchContent();
          },
        )
        .subscribe();
    } catch (err) {
      console.error('GB landing realtime unavailable:', err);
    }

    return () => {
      isMounted.current = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchContent]);

  const save = useCallback(async (next: GbLandingContent) => {
    const updatedAt = new Date().toISOString();
    const rows = gbLandingToRows(next).map((row) => ({ ...row, updated_at: updatedAt }));

    const { error: writeError } = await supabase.from('site_settings').upsert(rows);
    if (writeError) throw new Error(writeError.message);

    setContent(next);
    setError(null);
  }, []);

  return { content, loading, error, save, refetch: fetchContent };
}
