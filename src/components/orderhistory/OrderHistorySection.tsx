import React, { useEffect, useState } from 'react';
import { AlertCircle, Lock } from 'lucide-react';
import { useOrderHistoryDetail } from '../../hooks/useOrderHistoryDetail';
import OrderHistoryPanel from './OrderHistoryPanel';

interface Props {
    /** The address the customer typed, when they looked themselves up by email. */
    readonly verifiedEmail?: string | null;
    /** The order number they typed, when they looked up a single order. */
    readonly orderNumber?: string | null;
}

/**
 * Decides HOW the detailed history is unlocked, then renders it.
 *
 * Two paths, because the two lookups prove different things:
 *
 *   By email    — the customer already supplied the address the orders were
 *                 placed under, which is the bar the storefront accepts for
 *                 listing them. The history loads immediately.
 *
 *   By number   — an order number comes from a monotonic sequence, so it is
 *                 guessable from a neighbouring one. It is enough to show a
 *                 delivery status (that is what the status card above does) but
 *                 not to hand over a phone number and a home address. So this
 *                 asks for the matching email first, and the RPC checks the pair.
 */
const OrderHistorySection: React.FC<Props> = ({ verifiedEmail, orderNumber }) => {
    const { rows, loading, error, loadByEmail, loadByOrderNumber } = useOrderHistoryDetail();
    const [unlockEmail, setUnlockEmail] = useState('');
    const [attempted, setAttempted] = useState(false);

    const trimmedEmail = verifiedEmail?.trim() ?? '';

    useEffect(() => {
        if (!trimmedEmail) return;
        setAttempted(true);
        void loadByEmail(trimmedEmail);
    }, [trimmedEmail, loadByEmail]);

    // Nothing has been looked up yet — stay out of the way entirely.
    if (!trimmedEmail && !orderNumber) return null;

    const handleUnlock = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!orderNumber || !unlockEmail.trim()) return;
        setAttempted(true);
        await loadByOrderNumber(orderNumber, unlockEmail);
    };

    const needsUnlock = !trimmedEmail && rows.length === 0;

    return (
        <div className="space-y-4">
            {needsUnlock && (
                <section
                    aria-labelledby="order-history-unlock-heading"
                    className="bg-white rounded-2xl shadow-md p-5 md:p-6 border border-gray-100"
                >
                    <h2
                        id="order-history-unlock-heading"
                        className="text-sm font-bold text-navy-900 uppercase tracking-wider mb-2 flex items-center gap-2"
                    >
                        <Lock className="w-4 h-4 text-gold-600" />
                        See your full order history
                    </h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Confirm the email you used at checkout and we will show the complete record for
                        this order — items, charges, payment and status history.
                    </p>
                    <form onSubmit={handleUnlock} className="flex flex-col sm:flex-row gap-2">
                        <label htmlFor="order-history-unlock-email" className="sr-only">
                            Email used at checkout
                        </label>
                        <input
                            id="order-history-unlock-email"
                            type="email"
                            value={unlockEmail}
                            onChange={(event) => setUnlockEmail(event.target.value)}
                            placeholder="you@example.com"
                            className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-navy-900 focus:outline-none focus:border-navy-900 focus:ring-2 focus:ring-gold-500/20"
                        />
                        <button
                            type="submit"
                            disabled={loading || !unlockEmail.trim()}
                            className="rounded-lg bg-sakura-dark px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-sakura-deep disabled:opacity-50"
                        >
                            {loading ? 'Checking…' : 'View full order history'}
                        </button>
                    </form>

                    {attempted && !loading && !error && (
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

            {rows.length > 0 && <OrderHistoryPanel rows={rows} />}
        </div>
    );
};

export default OrderHistorySection;
