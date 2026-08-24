import React from 'react';
import { ChevronDown } from 'lucide-react';
import { formatPriceWithDecimals } from '../../utils/currency';
import { paymentStatusColor, paymentStatusLabel } from '../../constants/payment';
import { orderStatusLabel } from '../../utils/orderTracking';
import { batchLabel, deriveCharges } from '../../utils/orderHistory';
import OrderHistoryDetail from './OrderHistoryDetail';
import type { OrderHistoryRow } from '../../types';

interface Props {
    readonly order: OrderHistoryRow;
    readonly expanded: boolean;
    readonly onToggle: () => void;
}

function formatDay(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * One order in the history list: a summary line that always reads at a glance,
 * and the full record behind a disclosure so a long history stays scannable.
 */
const OrderHistoryCard: React.FC<Props> = ({ order, expanded, onToggle }) => {
    const charges = deriveCharges(order);
    const batch = batchLabel(order);
    const panelId = `order-history-panel-${order.id}`;
    const itemCount = order.order_items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);

    return (
        <article
            className={`bg-white rounded-2xl border transition-all ${
                expanded ? 'border-navy-900 shadow-lg' : 'border-gray-200 shadow-sm hover:border-navy-900/40'
            }`}
        >
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="w-full text-left px-5 py-4 md:px-6 flex items-start gap-3 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            >
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-mono font-bold text-navy-900">
                            {order.order_number ?? order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-500">{formatDay(order.created_at)}</span>
                        {batch && (
                            <span className="text-xs font-semibold text-gold-700 bg-gold-50 border border-gold-200 rounded-full px-2 py-0.5">
                                {batch}
                            </span>
                        )}
                        {order.is_claim && (
                            <span className="text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">
                                Add-on
                            </span>
                        )}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-gray-500">
                            {itemCount} item{itemCount === 1 ? '' : 's'}
                        </span>
                        <span className="font-semibold text-navy-900 tabular-nums">
                            {formatPriceWithDecimals(charges.grandTotal)}
                        </span>
                        <span
                            className={`px-2 py-0.5 rounded-full border font-bold ${paymentStatusColor(
                                order.payment_status,
                            )}`}
                        >
                            {paymentStatusLabel(order.payment_status, order.payment_type)}
                        </span>
                        <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50 font-bold text-gray-700">
                            {orderStatusLabel(order.order_status)}
                        </span>
                    </span>
                </span>
                <ChevronDown
                    aria-hidden="true"
                    className={`w-5 h-5 shrink-0 mt-0.5 text-gray-400 transition-transform ${
                        expanded ? 'rotate-180' : ''
                    }`}
                />
            </button>

            {expanded && (
                <div id={panelId}>
                    <OrderHistoryDetail order={order} />
                </div>
            )}
        </article>
    );
};

export default OrderHistoryCard;
