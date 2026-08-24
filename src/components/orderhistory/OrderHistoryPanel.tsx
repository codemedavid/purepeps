import React, { useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import {
    deriveFilterOptions,
    filterOrderHistory,
    hasActiveFilters,
    type OrderHistoryFilterCriteria,
} from '../../utils/orderHistoryFilters';
import OrderHistoryFilters from './OrderHistoryFilters';
import OrderHistoryCard from './OrderHistoryCard';
import type { OrderHistoryRow } from '../../types';

interface Props {
    /** The customer's own orders, already unlocked by the tracking lookup. */
    readonly rows: readonly OrderHistoryRow[];
}

const EMPTY_CRITERIA: OrderHistoryFilterCriteria = {};

/**
 * The customer's full order history: every order they have unlocked, searchable
 * and filterable, each expanding to the complete record.
 *
 * This narrows a list the RPC already authorized. It is not an access boundary —
 * see orderHistoryFilters.ts.
 */
const OrderHistoryPanel: React.FC<Props> = ({ rows }) => {
    const [criteria, setCriteria] = useState<OrderHistoryFilterCriteria>(EMPTY_CRITERIA);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const options = useMemo(() => deriveFilterOptions(rows), [rows]);
    const visible = useMemo(() => filterOrderHistory(rows, criteria), [rows, criteria]);

    const update = (patch: Partial<OrderHistoryFilterCriteria>) =>
        setCriteria((previous) => ({ ...previous, ...patch }));

    if (rows.length === 0) {
        return (
            <section
                aria-labelledby="order-history-heading"
                className="bg-white rounded-2xl shadow-md p-6 border border-gray-100 text-center"
            >
                <h2 id="order-history-heading" className="text-sm font-bold text-navy-900 uppercase tracking-wider mb-2">
                    Order History
                </h2>
                <p className="text-sm text-gray-500">
                    No orders to show yet. Look up an order above and its full history will appear here.
                </p>
            </section>
        );
    }

    return (
        <section aria-labelledby="order-history-heading" className="space-y-4">
            <div className="bg-white rounded-2xl shadow-md p-5 md:p-6 border border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <h2
                        id="order-history-heading"
                        className="text-sm font-bold text-navy-900 uppercase tracking-wider flex items-center gap-2"
                    >
                        <Package className="w-4 h-4 text-gold-600" />
                        Order History
                    </h2>
                    {/* Announced politely so a filter change is heard, not just seen. */}
                    <p role="status" aria-live="polite" className="text-xs text-gray-500 tabular-nums">
                        Showing {visible.length} of {rows.length}
                    </p>
                </div>

                <OrderHistoryFilters
                    criteria={criteria}
                    options={options}
                    showFilters={rows.length > 1}
                    onChange={update}
                    onClear={() => setCriteria(EMPTY_CRITERIA)}
                />
            </div>

            {visible.length === 0 ? (
                <p className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center text-sm text-gray-500">
                    No orders match {hasActiveFilters(criteria) ? 'those filters' : 'that search'}. Try clearing them.
                </p>
            ) : (
                <div className="space-y-3">
                    {visible.map((order) => (
                        <OrderHistoryCard
                            key={order.id}
                            order={order}
                            expanded={expandedId === order.id}
                            onToggle={() => setExpandedId((current) => (current === order.id ? null : order.id))}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};

export default OrderHistoryPanel;
