import React from 'react';
import { Search, X } from 'lucide-react';
import type { OrderHistoryFilterCriteria, OrderHistoryFilterOptions } from '../../utils/orderHistoryFilters';

interface Props {
    readonly criteria: OrderHistoryFilterCriteria;
    readonly options: OrderHistoryFilterOptions;
    readonly showFilters: boolean;
    readonly onChange: (patch: Partial<OrderHistoryFilterCriteria>) => void;
    readonly onClear: () => void;
}

const FIELD_CLASS =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy-900 focus:outline-none focus:border-navy-900 focus:ring-2 focus:ring-gold-500/20';

const LABEL_CLASS = 'block text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-400 mb-1';

/**
 * Search and filter controls for the order history.
 *
 * Every select is populated from the orders actually in hand, so no choice here
 * can produce an empty screen. A control with only one possible value is not
 * offered at all — one customer, or one group buy, is not a filter.
 */
const OrderHistoryFilters: React.FC<Props> = ({ criteria, options, showFilters, onChange, onClear }) => (
    <div className="space-y-3">
        <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <label htmlFor="order-history-search" className="sr-only">
                Search your orders
            </label>
            <input
                id="order-history-search"
                type="search"
                value={criteria.query ?? ''}
                onChange={(event) => onChange({ query: event.target.value })}
                placeholder="Search order number, product, or group buy"
                className={`${FIELD_CLASS} pl-9`}
            />
        </div>

        {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {options.customers.length > 1 && (
                    <div>
                        <label htmlFor="order-history-customer" className={LABEL_CLASS}>
                            Customer
                        </label>
                        <select
                            id="order-history-customer"
                            value={criteria.customer ?? ''}
                            onChange={(event) => onChange({ customer: event.target.value })}
                            className={FIELD_CLASS}
                        >
                            <option value="">All customers</option>
                            {options.customers.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {options.batches.length > 1 && (
                    <div>
                        <label htmlFor="order-history-batch" className={LABEL_CLASS}>
                            Group buy
                        </label>
                        <select
                            id="order-history-batch"
                            value={criteria.batch ?? ''}
                            onChange={(event) => onChange({ batch: event.target.value })}
                            className={FIELD_CLASS}
                        >
                            <option value="">All group buys</option>
                            {options.batches.map((batch) => (
                                <option key={batch.id} value={batch.id}>
                                    {batch.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {options.paymentStatuses.length > 1 && (
                    <div>
                        <label htmlFor="order-history-payment-status" className={LABEL_CLASS}>
                            Payment status
                        </label>
                        <select
                            id="order-history-payment-status"
                            value={criteria.paymentStatus ?? ''}
                            onChange={(event) => onChange({ paymentStatus: event.target.value })}
                            className={FIELD_CLASS}
                        >
                            <option value="">Any payment status</option>
                            {options.paymentStatuses.map((status) => (
                                <option key={status.value} value={status.value}>
                                    {status.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {options.orderStatuses.length > 1 && (
                    <div>
                        <label htmlFor="order-history-order-status" className={LABEL_CLASS}>
                            Order status
                        </label>
                        <select
                            id="order-history-order-status"
                            value={criteria.orderStatus ?? ''}
                            onChange={(event) => onChange({ orderStatus: event.target.value })}
                            className={FIELD_CLASS}
                        >
                            <option value="">Any order status</option>
                            {options.orderStatuses.map((status) => (
                                <option key={status.value} value={status.value}>
                                    {status.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label htmlFor="order-history-date-from" className={LABEL_CLASS}>
                        Ordered from
                    </label>
                    <input
                        id="order-history-date-from"
                        type="date"
                        value={criteria.dateFrom ?? ''}
                        onChange={(event) => onChange({ dateFrom: event.target.value })}
                        className={FIELD_CLASS}
                    />
                </div>

                <div>
                    <label htmlFor="order-history-date-to" className={LABEL_CLASS}>
                        Ordered up to
                    </label>
                    <input
                        id="order-history-date-to"
                        type="date"
                        value={criteria.dateTo ?? ''}
                        onChange={(event) => onChange({ dateTo: event.target.value })}
                        className={FIELD_CLASS}
                    />
                </div>
            </div>
        )}

        <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-navy-900 transition-colors"
        >
            <X className="w-3.5 h-3.5" />
            Clear filters
        </button>
    </div>
);

export default OrderHistoryFilters;
