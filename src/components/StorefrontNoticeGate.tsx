import { useState } from 'react';
import StorefrontNoticeModal from './StorefrontNoticeModal';
import { useStorefrontNotice } from '../hooks/useStorefrontNotice';

/**
 * Shows the Important Notice on every storefront visit. The acknowledgement is
 * intentionally kept in memory only — no localStorage — so a refresh brings the
 * notice back, which is what the disclaimer promises shoppers.
 */
export default function StorefrontNoticeGate() {
  const { notice, loading } = useStorefrontNotice();
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  if (loading || !notice.isEnabled || isAcknowledged) return null;

  return <StorefrontNoticeModal notice={notice} onAccept={() => setIsAcknowledged(true)} />;
}
