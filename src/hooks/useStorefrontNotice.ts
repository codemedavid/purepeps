import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_STOREFRONT_NOTICE,
  STOREFRONT_NOTICE_KEYS,
  StorefrontNotice,
  noticeFromSettings,
  noticeToSettingRows,
} from '../utils/storefrontNotice';
import { getActionErrorMessage } from '../utils/errorMessage';

interface UseStorefrontNoticeResult {
  notice: StorefrontNotice;
  loading: boolean;
  error: string | null;
  saveNotice: (notice: StorefrontNotice) => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Reads/writes the storefront Important Notice from the `site_settings` table.
 * A failed read is never fatal for shoppers: the modal falls back to the seeded
 * defaults so the disclaimer still shows.
 */
export const useStorefrontNotice = (): UseStorefrontNoticeResult => {
  const [notice, setNotice] = useState<StorefrontNotice>(DEFAULT_STOREFRONT_NOTICE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotice = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('site_settings')
        .select('id, value')
        .in('id', [...STOREFRONT_NOTICE_KEYS]);

      if (queryError) throw new Error(queryError.message);

      setNotice(noticeFromSettings(data ?? []));
    } catch (err) {
      console.error('Error fetching storefront notice:', err);
      setError(getActionErrorMessage(err, 'Failed to load the storefront notice'));
      setNotice(DEFAULT_STOREFRONT_NOTICE);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveNotice = useCallback(async (next: StorefrontNotice) => {
    try {
      setError(null);

      const { error: upsertError } = await supabase.from('site_settings').upsert(noticeToSettingRows(next));

      if (upsertError) throw new Error(upsertError.message);

      setNotice(next);
    } catch (err) {
      console.error('Error saving storefront notice:', err);
      setError(getActionErrorMessage(err, 'Failed to save the storefront notice'));
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchNotice();
  }, [fetchNotice]);

  return { notice, loading, error, saveNotice, refetch: fetchNotice };
};
