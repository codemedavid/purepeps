import React, { useEffect, useState } from 'react';
import { AlertCircle, Lock } from 'lucide-react';
import { useOrderHistoryDetail } from '../../hooks/useOrderHistoryDetail';
import OrderHistoryDetail from '../orderhistory/OrderHistoryDetail';
import TrackerOrderSummary from './TrackerOrderSummary';
import type { OrderBundleRow } from '../../types';

interface Props {
  /** Email already proved by an email lookup, or by a previous unlock. */
  readonly verifiedEmail?: string | null;
  readonly orderNumber?: string | null;
  readonly selectedOrderId?: string | null;
  /** Status-only bundle row, shown until the full record is unlocked. */
  readonly fallbackOrder: OrderBundleRow;
}

/**
 * The complete order record inside the tracker card.
 *
 * get_order_bundle is enough for status and tracking, but it does not return
 * a name, address or notes — an order number is guessable. Once the matching
 * email is known, this loads the same history row the Order History panel uses
 * and renders that sheet here, so the customer does not have to scroll to a
 * second, locked panel.
 */
const TrackedOrderRecord: React.FC<Props> = ({
  verifiedEmail,
  orderNumber,
  selectedOrderId,
  fallbackOrder,
}) => {
  const { rows, loading, error, loadByEmail, loadByOrderNumber } = useOrderHistoryDetail();
  const [unlockEmail, setUnlockEmail] = useState('');
  const [attempted, setAttempted] = useState(false);

  const trimmedEmail = verifiedEmail?.trim() ?? '';

  useEffect(() => {
    if (!trimmedEmail) return;
    setAttempted(true);
    void loadByEmail(trimmedEmail);
  }, [trimmedEmail, loadByEmail]);

  const handleUnlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orderNumber || !unlockEmail.trim()) return;
    setAttempted(true);
    await loadByOrderNumber(orderNumber, unlockEmail);
  };

  const detail =
    rows.find((row) => row.id === selectedOrderId) ??
    rows.find((row) => row.order_number === fallbackOrder.order_number) ??
    (rows.length === 1 ? rows[0] : null);

  const needsUnlock = !trimmedEmail && rows.length === 0;

  if (detail) {
    return (
      <section
        aria-labelledby="tracked-order-details-heading"
        className="bg-white rounded-xl border-2 border-gray-100 overflow-hidden"
      >
        <h3
          id="tracked-order-details-heading"
          className="px-5 pt-5 md:px-6 md:pt-6 font-bold text-navy-900 text-sm uppercase tracking-wider"
        >
          Order details
        </h3>
        <OrderHistoryDetail order={detail} />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {needsUnlock && (
        <section
          aria-labelledby="tracked-order-unlock-heading"
          className="bg-gold-50/40 rounded-xl border border-gold-200 p-5"
        >
          <h3
            id="tracked-order-unlock-heading"
            className="text-sm font-bold text-navy-900 uppercase tracking-wider mb-2 flex items-center gap-2"
          >
            <Lock className="w-4 h-4 text-gold-600" />
            See the complete order
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Confirm the email you used at checkout and we will show everything on this
            order — customer, delivery, items, charges, payment, notes and status history.
          </p>
          <form onSubmit={handleUnlock} className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="tracked-order-unlock-email" className="sr-only">
              Email used at checkout
            </label>
            <input
              id="tracked-order-unlock-email"
              type="email"
              value={unlockEmail}
              onChange={(event) => setUnlockEmail(event.target.value)}
              placeholder="you@example.com"
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-navy-900 focus:ring-2 focus:ring-gold-500/20"
            />
            <button
              type="submit"
              disabled={loading || !unlockEmail.trim()}
              className="rounded-lg bg-sakura-dark px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-sakura-deep disabled:opacity-50"
            >
              {loading ? 'Checking…' : 'Show full order details'}
            </button>
          </form>
          {attempted && !loading && !error && rows.length === 0 && (
            <p className="mt-3 text-sm text-red-700">
              We could not match that order number and email. Please check both and try again.
            </p>
          )}
        </section>
      )}

      {error && (
        <p className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </p>
      )}

      <TrackerOrderSummary order={fallbackOrder} />
    </div>
  );
};

export default TrackedOrderRecord;
