import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_STOREFRONT_NOTICE,
  isStorefrontPageId,
  type NoticeAudience,
  type NoticeFrequency,
  type NoticePageId,
  type NoticeStyle,
  type StorefrontNotice,
} from '../utils/storefrontNotice';
import { getActionErrorMessage } from '../utils/errorMessage';

export type StorefrontNoticeEvent = 'impression' | 'acknowledgement';

interface PublicNoticeRow {
  id: string;
  version: number;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  audience: NoticeAudience;
  page_ids: NoticePageId[];
  frequency: NoticeFrequency;
  style: NoticeStyle;
  title: string;
  subtitle: string;
  body: string;
  highlight: string;
  policy_title: string;
  policy_lines: string;
  button_label: string;
  footer_note: string;
  published_at: string | null;
}

interface UseStorefrontNoticeResult {
  notice: StorefrontNotice | null;
  loading: boolean;
  error: string | null;
  recordEvent: (event: StorefrontNoticeEvent) => Promise<void>;
  refetch: () => Promise<void>;
}

const fromPublicRow = (row: PublicNoticeRow): StorefrontNotice => ({
  id: row.id,
  internalName: '',
  status: 'published',
  version: row.version,
  priority: row.priority,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  audience: row.audience,
  pageIds: row.page_ids,
  frequency: row.frequency,
  style: row.style,
  publishedAt: row.published_at,
  createdAt: '',
  updatedAt: '',
  isEnabled: true,
  title: row.title,
  subtitle: row.subtitle,
  body: row.body,
  highlight: row.highlight,
  policyTitle: row.policy_title,
  policyLines: row.policy_lines,
  buttonLabel: row.button_label,
  footerNote: row.footer_note,
});

const fallbackNoticeFor = (pageId: NoticePageId): StorefrontNotice | null =>
  isStorefrontPageId(pageId) ? DEFAULT_STOREFRONT_NOTICE : null;

/**
 * Loads the single highest-priority notice eligible for this public page.
 * On the storefront, a published row wins and the hard-coded research-use
 * notice fills in when none matches. Standalone pages stay quiet unless a
 * published notice targets them, so switching Labs/Orders/Guides does not
 * re-open the legal popup.
 */
export const useStorefrontNotice = (
  pageId: NoticePageId,
  shopperType: Exclude<NoticeAudience, 'everyone'>,
): UseStorefrontNoticeResult => {
  const [notice, setNotice] = useState<StorefrontNotice | null>(() => fallbackNoticeFor(pageId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchGeneration = useRef(0);

  const fetchNotice = useCallback(async () => {
    const generation = ++fetchGeneration.current;
    try {
      setError(null);
      const { data, error: queryError } = await supabase.rpc('get_active_storefront_notice', {
        p_page_id: pageId,
        p_audience: shopperType,
      });
      if (generation !== fetchGeneration.current) return;
      if (queryError) throw new Error(queryError.message);
      const first = ((data ?? []) as PublicNoticeRow[])[0];
      setNotice(first ? fromPublicRow(first) : fallbackNoticeFor(pageId));
    } catch (err) {
      if (generation !== fetchGeneration.current) return;
      console.error('Error fetching storefront notice:', err);
      setError(getActionErrorMessage(err, 'Failed to load the storefront notice'));
      setNotice(fallbackNoticeFor(pageId));
    } finally {
      if (generation === fetchGeneration.current) setLoading(false);
    }
  }, [pageId, shopperType]);

  useEffect(() => {
    void fetchNotice();
  }, [fetchNotice]);

  const recordEvent = useCallback(async (event: StorefrontNoticeEvent) => {
    if (!notice || notice.id === DEFAULT_STOREFRONT_NOTICE.id) return;
    const { error: eventError } = await supabase.rpc('record_storefront_notice_event', {
      p_notice_id: notice.id,
      p_version: notice.version,
      p_event: event,
    });
    if (eventError) console.error('Error recording storefront notice event:', eventError);
  }, [notice]);

  return { notice, loading, error, recordEvent, refetch: fetchNotice };
};
