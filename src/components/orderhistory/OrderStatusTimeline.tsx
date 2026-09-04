import React from 'react';
import { CheckCircle, Circle, AlertCircle } from 'lucide-react';
import { buildStatusTimeline, formatMoment, isTimelinePartial } from '../../utils/orderHistory';
import type { OrderHistoryRow } from '../../types';

export { formatMoment };

interface Props {
    readonly order: OrderHistoryRow;
}

/**
 * Every recorded change of state for one order, oldest first.
 *
 * The newest entry is the one that matters most, so it is the only one drawn
 * filled — the rest recede into the trail that leads to it.
 */
const OrderStatusTimeline: React.FC<Props> = ({ order }) => {
    const entries = buildStatusTimeline(order);
    const partial = isTimelinePartial(order);
    const lastIndex = entries.length - 1;

    return (
        <div>
            {partial && (
                <p className="flex items-start gap-2 text-xs text-gray-500 mb-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-px text-gold-600" />
                    <span>
                        This order was placed before we began recording status changes, so its
                        history starts here. Everything from now on is tracked.
                    </span>
                </p>
            )}

            <ol aria-label="Order status timeline" className="relative space-y-4">
                {entries.map((entry, index) => {
                    const isLatest = index === lastIndex;
                    return (
                        <li key={entry.key} className="relative flex gap-3 pl-1">
                            {/* Connector, drawn behind every marker but the last. */}
                            {index < lastIndex && (
                                <span
                                    aria-hidden="true"
                                    className="absolute left-[0.4375rem] top-5 bottom-[-1rem] w-px bg-gray-200"
                                />
                            )}
                            <span className="relative shrink-0 mt-0.5">
                                {isLatest ? (
                                    <CheckCircle className="w-4 h-4 text-teal-600" />
                                ) : (
                                    <Circle className="w-4 h-4 text-gray-300" />
                                )}
                            </span>
                            <span className="min-w-0">
                                <span
                                    className={`block text-sm ${
                                        isLatest ? 'font-bold text-navy-900' : 'font-semibold text-gray-600'
                                    }`}
                                >
                                    {entry.label}
                                </span>
                                <span className="block text-xs text-gray-500">
                                    {formatMoment(entry.occurredAt)}
                                    {entry.detail ? ` · ${entry.detail}` : ''}
                                </span>
                            </span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
};

export default OrderStatusTimeline;
