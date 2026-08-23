import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_SETTING_KEYS,
  featureFlagsFromRows,
  getFeatureDefinition,
  serializeFeatureFlagValue,
  type FeatureFlagRow,
  type FeatureFlags,
  type FeatureId,
} from '../utils/featureFlags';
import { getActionErrorMessage } from '../utils/errorMessage';

export interface FeatureFlagsState {
  /** Which features are currently visible to customers. */
  flags: FeatureFlags;
  /** True until the settings have been read once. */
  loading: boolean;
  /** Last read/write failure, or null. Flags stay usable either way. */
  error: string | null;
  /** Admin-only: show or hide one feature by upserting its site_settings row. */
  setFeatureEnabled: (id: FeatureId, enabled: boolean) => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Reads (and, for admins, writes) the six per-feature visibility flags.
 *
 * All six rows are fetched in ONE round trip. Reads FAIL OPEN — an error leaves
 * every feature visible rather than blanking the navigation — which mirrors
 * `useAccessIntake`. Writes touch exactly one `site_settings` row and never any
 * content table, so switching a feature off cannot delete anything.
 */
export function useFeatureFlags(): FeatureFlagsState {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchFlags = useCallback(async () => {
    try {
      const { data, error: readError } = await supabase
        .from('site_settings')
        .select('id,value')
        .in('id', [...FEATURE_SETTING_KEYS]);

      if (readError) throw readError;
      if (!isMounted.current) return;

      setFlags(featureFlagsFromRows(data as FeatureFlagRow[] | null));
      setError(null);
    } catch (err) {
      // Fail open: keep every feature visible so a settings outage never makes
      // the storefront look broken.
      console.error('Error loading feature visibility settings:', err);
      if (!isMounted.current) return;
      setFlags(DEFAULT_FEATURE_FLAGS);
      setError(getActionErrorMessage(err, 'load feature visibility settings'));
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchFlags();

    // Live refresh is best-effort: if Realtime is not enabled for site_settings
    // an admin's toggle still lands on the next page load.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('feature-visibility-settings')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'site_settings' },
          () => {
            fetchFlags();
          },
        )
        .subscribe();
    } catch (err) {
      console.error('Feature visibility realtime unavailable:', err);
    }

    return () => {
      isMounted.current = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchFlags]);

  const setFeatureEnabled = useCallback(async (id: FeatureId, enabled: boolean) => {
    const { settingKey, label } = getFeatureDefinition(id);

    const { error: writeError } = await supabase.from('site_settings').upsert({
      id: settingKey,
      value: serializeFeatureFlagValue(enabled),
      type: 'boolean',
      description: `When false, ${label} is hidden from the storefront navigation and its page redirects home.`,
      updated_at: new Date().toISOString(),
    });

    if (writeError) throw new Error(writeError.message);

    // Only this feature moves; the other five keep whatever they already had.
    setFlags((current) => ({ ...current, [id]: enabled }));
  }, []);

  return { flags, loading, error, setFeatureEnabled, refetch: fetchFlags };
}
