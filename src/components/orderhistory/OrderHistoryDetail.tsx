import React from 'react';
import { User, MapPin, Package, Receipt, CreditCard, StickyNote, Clock } from 'lucide-react';
import { formatPriceWithDecimals } from '../../utils/currency';
import { paymentStatusColor, paymentStatusLabel, paymentTypeLabel } from '../../constants/payment';
import { orderStatusLabel } from '../../utils/orderTracking';
import { deriveCharges, describeVariation } from '../../utils/orderHistory';
import OrderStatusTimeline, { formatMoment } from './OrderStatusTimeline';
import LigwakNotice from './LigwakNotice';
import type { OrderHistoryRow } from '../../types';

interface Props {
    readonly order: OrderHistoryRow;
}

/** A labelled section of the detail sheet. */
const Block: React.FC<{
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}> = ({ icon, title, children }) => (
    <section aria-label={title} className="py-5 border-t border-gray-100 first:border-t-0 first:pt-0">
        <h4 className="flex items-center gap-2 text-xs font-bold text-navy-900 uppercase tracking-wider mb-3">
            <span className="text-gold-600">{icon}</span>
            {title}
        </h4>
        {children}
    </section>
);

/** One label/value pair. Renders nothing at all when there is no value. */
const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => {
    if (value === null || value === undefined || value === '') return null;
    return (
        <div className="min-w-0">
            <dt className="text-[0.6875rem] uppercase tracking-wide text-gray-400 font-semibold">{label}</dt>
            <dd className="text-sm text-navy-900 break-words">{value}</dd>
        </div>
    );
};

/** One line of the money breakdown. */
const Money: React.FC<{ label: React.ReactNode; value: string; strong?: boolean }> = ({
    label,
    value,
    strong = false,
}) => (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? 'pt-2 mt-1 border-t border-gray-200' : ''}`}>
        <span className={strong ? 'text-sm font-bold text-navy-900' : 'text-sm text-gray-600'}>{label}</span>
        <span
            className={`tabular-nums ${strong ? 'text-lg font-bold text-navy-900' : 'text-sm font-semibold text-gray-700'}`}
        >
            {value}
        </span>
    </div>
);

/**
 * Everything known about one order, laid out as the customer would read it:
 * who it is for, where it goes, what is in it, what it cost, how it is being
 * paid, what they asked for, and how it got to where it is.
 */
const OrderHistoryDetail: React.FC<Props> = ({ order }) => {
    const charges = deriveCharges(order);
    const isCod = order.payment_type === 'cod';

    const addressLine = [
        order.shipping_address,
        order.shipping_barangay,
        order.shipping_city,
        order.shipping_state,
        order.shipping_zip_code,
        order.shipping_country,
    ]
        .filter(Boolean)
        .join(', ');

    return (
        <div className="px-5 pb-5 md:px-6 md:pb-6">
            <Block icon={<User className="w-4 h-4" />} title="Customer">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    <Field label="Name" value={order.customer_name} />
                    <Field label="Email" value={order.customer_email} />
                    <Field label="Phone" value={order.customer_phone} />
                    <Field label="Preferred contact" value={order.contact_method} />
                </dl>
            </Block>

            <Block icon={<MapPin className="w-4 h-4" />} title="Delivery & checkout details">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    <Field label="Shipping address" value={addressLine || null} />
                    <Field label="Shipping area" value={order.shipping_location} />
                    <Field label="Courier" value={order.shipping_provider} />
                    <Field label="Tracking number" value={order.tracking_number} />
                    <Field label="Sticker" value={order.selected_sticker_name} />
                    <Field label="Courier note" value={order.shipping_note} />
                </dl>
            </Block>

            <Block icon={<Package className="w-4 h-4" />} title="Items ordered">
                {/* Wide content scrolls inside its own box so the page never does. */}
                <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-sm min-w-[30rem]" aria-label="Items ordered">
                        <thead>
                            <tr className="text-left text-[0.6875rem] uppercase tracking-wide text-gray-400">
                                <th scope="col" className="font-semibold pb-2">Product</th>
                                <th scope="col" className="font-semibold pb-2 text-right w-16">Qty</th>
                                <th scope="col" className="font-semibold pb-2 text-right w-28">Price</th>
                                <th scope="col" className="font-semibold pb-2 text-right w-28">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {order.order_items.map((item, index) => {
                                const variation = describeVariation(item);
                                return (
                                    <tr key={`${item.product_id}-${item.variation_id ?? 'base'}-${index}`}>
                                        <td className="py-2.5 pr-3">
                                            <span className="block font-semibold text-navy-900">{item.product_name}</span>
                                            {variation && (
                                                <span className="block text-xs text-gray-500">{variation}</span>
                                            )}
                                        </td>
                                        <td className="py-2.5 text-right tabular-nums text-gray-700">{item.quantity}</td>
                                        <td className="py-2.5 text-right tabular-nums text-gray-700">
                                            {formatPriceWithDecimals(Number(item.price ?? 0))}
                                        </td>
                                        <td className="py-2.5 text-right tabular-nums font-semibold text-navy-900">
                                            {formatPriceWithDecimals(Number(item.total ?? 0))}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Block>

            <Block icon={<Receipt className="w-4 h-4" />} title="Charges">
                <div className="space-y-1.5 max-w-sm">
                    <Money label="Subtotal" value={formatPriceWithDecimals(charges.subtotal)} />
                    {charges.discount > 0 && (
                        <Money
                            label={
                                <>
                                    Discount
                                    {order.promo_code && (
                                        <span className="ml-2 text-xs font-mono font-bold text-teal-600">
                                            {order.promo_code}
                                        </span>
                                    )}
                                </>
                            }
                            value={`-${formatPriceWithDecimals(charges.discount)}`}
                        />
                    )}
                    <Money label="Shipping fee" value={formatPriceWithDecimals(charges.shippingFee)} />
                    <Money label="Total" value={formatPriceWithDecimals(charges.grandTotal)} strong />
                    {charges.refunded > 0 && (
                        <Money label="Refunded" value={formatPriceWithDecimals(charges.refunded)} />
                    )}
                    {charges.balanceDue > 0 && (
                        <Money label="Balance due" value={formatPriceWithDecimals(charges.balanceDue)} />
                    )}
                </div>
            </Block>

            <Block icon={<CreditCard className="w-4 h-4" />} title="Payment">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-3">
                    <Field label="Method" value={order.payment_method_name} />
                    <Field label="Option" value={paymentTypeLabel(order.payment_type)} />
                    <Field
                        label="Payment status"
                        value={
                            <span
                                className={`inline-block px-2 py-0.5 rounded-full border text-xs font-bold ${paymentStatusColor(
                                    order.payment_status,
                                )}`}
                            >
                                {paymentStatusLabel(order.payment_status, order.payment_type)}
                            </span>
                        }
                    />
                    <Field label="Order status" value={orderStatusLabel(order.order_status)} />
                </dl>

                {/* The payment option governs the SHIPPING FEE only — items are
                    bought online either way. Spelling out both halves stops a COD
                    customer expecting to hand over the whole order value. */}
                <p className="text-xs text-gray-600 bg-gold-50/50 border border-gold-200 rounded-lg p-3">
                    Paid online: <strong className="text-navy-900">{formatPriceWithDecimals(charges.payableOnline)}</strong>
                    {isCod && (
                        <>
                            {' · '}
                            <span>
                                The courier collects{' '}
                                <strong className="text-navy-900">
                                    {formatPriceWithDecimals(charges.payableOnDelivery)}
                                </strong>{' '}
                                on delivery — the shipping fee only.
                            </span>
                        </>
                    )}
                </p>
            </Block>

            {/* Placed above the customer's own notes: if part of this order fell
                outside a complete kit, that is the first thing they need to see. */}
            <LigwakNotice ligwak={order.ligwak ?? []} />

            {order.notes && (
                <Block icon={<StickyNote className="w-4 h-4" />} title="Your notes">
                    <p className="text-sm text-navy-900 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg p-3">
                        {order.notes}
                    </p>
                </Block>
            )}

            <Block icon={<Clock className="w-4 h-4" />} title="Status history">
                <OrderStatusTimeline order={order} />
                <p className="text-xs text-gray-400 mt-4">Ordered {formatMoment(order.created_at)}</p>
            </Block>
        </div>
    );
};

export default OrderHistoryDetail;
