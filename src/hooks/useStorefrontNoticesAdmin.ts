import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  validateNoticeForPublish,
  type NoticeAudience,
  type NoticeFrequency,
  type NoticePageId,
  type NoticeStatus,
  type NoticeStyle,
  type StorefrontNotice,
} from '../utils/storefrontNotice';
import { getActionErrorMessage } from '../utils/errorMessage';

interface AdminNoticeRow {
  id: string;
  internal_name: string;
  status: NoticeStatus;
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
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface StatsRow {
  notice_id: string;
  version: number;
  impression_count: number;
  acknowledgement_count: number;
}

export interface ManagedStorefrontNotice extends StorefrontNotice {
  impressionCount: number;
  acknowledgementCount: number;
}

const fromRow = (row: AdminNoticeRow, stats?: StatsRow): ManagedStorefrontNotice => ({
  id: row.id,
  internalName: row.internal_name,
  status: row.status,
  version: row.version,
  priority: row.priority,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  audience: row.audience,
  pageIds: row.page_ids,
  frequency: row.frequency,
  style: row.style,
  publishedAt: row.published_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  isEnabled: row.status === 'published',
  title: row.title,
  subtitle: row.subtitle,
  body: row.body,
  highlight: row.highlight,
  policyTitle: row.policy_title,
  policyLines: row.policy_lines,
  buttonLabel: row.button_label,
  footerNote: row.footer_note,
  impressionCount: stats?.impression_count ?? 0,
  acknowledgementCount: stats?.acknowledgement_count ?? 0,
});

const toRow = (notice: StorefrontNotice) => ({
  internal_name: notice.internalName,
  status: notice.status,
  version: notice.version,
  priority: notice.priority,
  starts_at: notice.startsAt,
  ends_at: notice.endsAt,
  audience: notice.audience,
  page_ids: notice.pageIds,
  frequency: notice.frequency,
  style: notice.style,
  title: notice.title,
  subtitle: notice.subtitle,
  body: notice.body,
  highlight: notice.highlight,
  policy_title: notice.policyTitle,
  policy_lines: notice.policyLines,
  button_label: notice.buttonLabel,
  footer_note: notice.footerNote,
  published_at: notice.publishedAt,
  archived_at: notice.status === 'archived' ? new Date().toISOString() : null,
});

const throwOnError = (error: { message: string } | null, fallback: string) => {
  if (error) throw new Error(error.message || fallback);
};

export function useStorefrontNoticesAdmin() {
  const [notices, setNotices] = useState<ManagedStorefrontNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [noticeResult, statsResult] = await Promise.all([
        supabase.from('storefront_notices').select('*').order('updated_at', { ascending: false }),
        supabase.from('storefront_notice_stats').select('*'),
      ]);
      throwOnError(noticeResult.error, 'Failed to load notices');
      throwOnError(statsResult.error, 'Failed to load notice statistics');
      const stats = (statsResult.data ?? []) as StatsRow[];
      setNotices(((noticeResult.data ?? []) as AdminNoticeRow[]).map((row) =>
        fromRow(row, stats.find((item) => item.notice_id === row.id && item.version === row.version)),
      ));
    } catch (err) {
      setError(getActionErrorMessage(err, 'Failed to load notices'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotices();
  }, [fetchNotices]);

  const saveDraft = useCallback(async (notice: StorefrontNotice): Promise<ManagedStorefrontNotice> => {
    const payload = toRow({ ...notice, status: notice.id ? notice.status : 'draft' });
    const result = notice.id
      ? await supabase.from('storefront_notices').update(payload).eq('id', notice.id).select().single()
      : await supabase.from('storefront_notices').insert(payload).select().single();
    throwOnError(result.error, 'Failed to save notice');
    const saved = fromRow(result.data as AdminNoticeRow);
    setNotices((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    return saved;
  }, []);

  const publishNotice = useCallback(async (
    notice: StorefrontNotice,
    asNewVersion: boolean,
  ): Promise<ManagedStorefrontNotice> => {
    if (Object.keys(validateNoticeForPublish(notice)).length > 0) {
      throw new Error('Complete the required fields before publishing.');
    }
    const next = {
      ...notice,
      status: 'published' as const,
      version: notice.version + (asNewVersion ? 1 : 0),
      publishedAt: new Date().toISOString(),
    };
    const payload = toRow(next);
    const result = notice.id
      ? await supabase.from('storefront_notices').update(payload).eq('id', notice.id).select().single()
      : await supabase.from('storefront_notices').insert(payload).select().single();
    throwOnError(result.error, 'Failed to publish notice');
    const saved = fromRow(result.data as AdminNoticeRow);
    setNotices((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    return saved;
  }, []);

  const archiveNotice = useCallback(async (notice: StorefrontNotice) => {
    const payload = toRow({ ...notice, status: 'archived' });
    const result = await supabase.from('storefront_notices').update(payload).eq('id', notice.id).select().single();
    throwOnError(result.error, 'Failed to archive notice');
    const saved = fromRow(result.data as AdminNoticeRow);
    setNotices((current) => current.map((item) => item.id === saved.id ? saved : item));
  }, []);

  const deleteNotice = useCallback(async (notice: StorefrontNotice) => {
    if (notice.status === 'published') throw new Error('Archive a published notice before deleting it.');
    const { error: deleteError } = await supabase.from('storefront_notices').delete().eq('id', notice.id);
    throwOnError(deleteError, 'Failed to delete notice');
    setNotices((current) => current.filter((item) => item.id !== notice.id));
  }, []);

  const duplicateNotice = useCallback(async (notice: StorefrontNotice) => saveDraft({
    ...notice,
    id: '',
    internalName: `${notice.internalName} (Copy)`,
    status: 'draft',
    version: 1,
    publishedAt: null,
    createdAt: '',
    updatedAt: '',
  }), [saveDraft]);

  return {
    notices,
    loading,
    error,
    refetch: fetchNotices,
    saveDraft,
    publishNotice,
    archiveNotice,
    deleteNotice,
    duplicateNotice,
  };
}
