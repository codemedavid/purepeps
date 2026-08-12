import { useEffect, useRef, useState } from 'react';
import StorefrontNoticeModal from './StorefrontNoticeModal';
import { useStorefrontNotice } from '../hooks/useStorefrontNotice';
import {
  acknowledgeNotice,
  getNoticeAcknowledgementKey,
  hasAcknowledgedNotice,
  type NoticeAudience,
  type NoticePageId,
} from '../utils/storefrontNotice';

interface StorefrontNoticeGateProps {
  pageId: NoticePageId;
  shopperType: Exclude<NoticeAudience, 'everyone'>;
}

/** Displays and tracks the highest eligible notice for one public page/view. */
export default function StorefrontNoticeGate({ pageId, shopperType }: StorefrontNoticeGateProps) {
  const { notice, loading, recordEvent } = useStorefrontNotice(pageId, shopperType);
  const [memoryAcknowledgement, setMemoryAcknowledgement] = useState<string | null>(null);
  const countedImpression = useRef<string | null>(null);

  const acknowledgementKey = notice ? getNoticeAcknowledgementKey(notice) : null;
  const storedAcknowledgement = notice
    ? hasAcknowledgedNotice(notice, window.localStorage, window.sessionStorage)
    : false;
  const isAcknowledged = storedAcknowledgement || memoryAcknowledgement === acknowledgementKey;
  const shouldShow = !loading && notice !== null && !isAcknowledged;

  useEffect(() => {
    if (!shouldShow || !acknowledgementKey || countedImpression.current === acknowledgementKey) return;
    countedImpression.current = acknowledgementKey;
    void recordEvent('impression');
  }, [acknowledgementKey, recordEvent, shouldShow]);

  if (!shouldShow || !notice) return null;

  const handleAccept = () => {
    acknowledgeNotice(notice, window.localStorage, window.sessionStorage);
    setMemoryAcknowledgement(getNoticeAcknowledgementKey(notice));
    void recordEvent('acknowledgement');
  };

  return <StorefrontNoticeModal notice={notice} onAccept={handleAccept} />;
}
