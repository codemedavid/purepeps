import {
  paymentStatusColor,
  paymentStatusLabel,
  paymentTypeLabel,
} from '../../constants/payment';
import { formatPriceWithDecimals } from '../../utils/currency';
import { deriveCharges, describeVariation, formatMoment } from '../../utils/orderHistory';
import type { OrderBundleRow, OrderLineItem } from '../../types';

interface Props {
  readonly order: OrderBundleRow;
}

function unitPrice(item: OrderLineItem): number | null {
  if (item.price == null || Number.isNaN(Number(item.price))) return null;
  return Number(item.price);
}

function lineTotal(item: OrderLineItem): number | null {
  if (item.total != null && !Number.isNaN(Number(item.total))) return Number(item.total);
  const unit = unitPrice(item);
  if (unit == null) return null;
  return unit * Number(item.quantity ?? 0);
}

/**
 * The order's items, charges and payment — the non-PII record the tracker can
 * show from get_order_bundle. Name, address and notes stay in the email-gated
 * history panel: an order number alone must not unlock them.
 */
const TrackerOrderSummary: React.FC<Props> = ({ order }) => {
  const charges = deriveCharges(order);
  const isCod = order.payment_type === 'cod';

  return (
    <section aria-labelledby="tracker-order-summary-heading" className="bg-white rounded-xl p-5 border-2 border-gray-100">
      <h3 id="tracker-order-summary-heading" className="font-bold text-navy-900 mb-3 text-sm uppercase tracking-wider border-b pb-2">
        Order Summary
      </h3>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
        <div>
          <dt className="text-[0.6875rem] uppercase tracking-wide text-gray-400 font-semibold">Ordered</dt>
          <dd className="text-navy-900">{formatMoment(order.created_at)}</dd>
        </div>
        {order.group_buy_batch_id && (
          <div>
            <dt className="text-[0.6875rem] uppercase tracking-wide text-gray-400 font-semibold">Group buy</dt>
            <dd className="text-navy-900">This order is in a group buy</dd>
          </div>
        )}
      </dl>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm min-w-[18rem]" aria-label="Tracked order items">
          <thead>
            <tr className="text-left text-[0.6875rem] uppercase tracking-wide text-gray-400">
              <th scope="col" className="font-semibold pb-2">Product</th>
              <th scope="col" className="font-semibold pb-2 text-right w-12">Qty</th>
              <th scope="col" className="font-semibold pb-2 text-right w-24">Price</th>
              <th scope="col" className="font-semibold pb-2 text-right w-24">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {order.order_items.map((item, index) => {
              const variation = describeVariation(item);
              const unit = unitPrice(item);
              const total = lineTotal(item);
              return (
                <tr key={`${item.product_id ?? item.product_name}-${item.variation_id ?? 'base'}-${index}`}>
                  <td className="py-2 pr-3">
                    <span className="block font-semibold text-navy-900">{item.product_name}</span>
                    {variation && <span className="block text-xs text-gray-500">{variation}</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{item.quantity}</td>
                  <td className="py-2 text-right tabular-nums text-gray-700">
                    {unit == null ? '—' : formatPriceWithDecimals(unit)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold text-navy-900">
                    {total == null ? '—' : formatPriceWithDecimals(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-1.5 pt-3 mt-3 border-t border-gray-100 text-sm">
        <h4 className="sr-only">Charges</h4>
        <div className="flex justify-between gap-4 text-gray-600">
          <span>Subtotal</span>
          <span className="tabular-nums font-semibold text-gray-700">{formatPriceWithDecimals(charges.subtotal)}</span>
        </div>
        {charges.discount > 0 && (
          <div className="flex justify-between gap-4 text-green-600">
            <span>
              Discount
              {order.promo_code && (
                <span className="ml-2 text-xs font-mono font-bold">{order.promo_code}</span>
              )}
            </span>
            <span className="tabular-nums font-semibold">{`-${formatPriceWithDecimals(charges.discount)}`}</span>
          </div>
        )}
        {charges.shippingFee > 0 && (
          <div className="flex justify-between gap-4 text-gray-600">
            <span>Shipping fee</span>
            <span className="tabular-nums font-semibold text-gray-700">
              {formatPriceWithDecimals(charges.shippingFee)}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-4 pt-2 mt-1 border-t border-gray-200 font-bold text-navy-900">
          <span>Total</span>
          <span className="tabular-nums text-lg">{formatPriceWithDecimals(charges.grandTotal)}</span>
        </div>
        {charges.refunded > 0 && (
          <div className="flex justify-between gap-4 text-gray-600">
            <span>Refunded</span>
            <span className="tabular-nums font-semibold text-gray-700">
              {formatPriceWithDecimals(charges.refunded)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
        <h4 className="text-[0.6875rem] uppercase tracking-wide text-gray-400 font-semibold">Payment</h4>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {order.payment_method_name && (
            <div>
              <dt className="text-gray-500">Method</dt>
              <dd className="font-semibold text-navy-900">{order.payment_method_name}</dd>
            </div>
          )}
          <div>
            <dt className="text-gray-500">Option</dt>
            <dd className="font-semibold text-navy-900">{paymentTypeLabel(order.payment_type)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd>
              <span
                className={`inline-block px-2 py-0.5 rounded-full border text-xs font-bold ${paymentStatusColor(
                  order.payment_status,
                )}`}
              >
                {paymentStatusLabel(order.payment_status, order.payment_type)}
              </span>
            </dd>
          </div>
        </dl>
        {isCod && (
          <p className="text-xs text-gray-600 bg-gold-50/50 border border-gold-200 rounded-lg p-3">
            Paid online:{' '}
            <strong className="text-navy-900">
              {formatPriceWithDecimals(charges.payableOnline)}
            </strong>
            {' · '}
            The courier collects{' '}
            <strong className="text-navy-900">{formatPriceWithDecimals(charges.payableOnDelivery)}</strong> on
            delivery — the shipping fee only.
          </p>
        )}
      </div>
    </section>
  );
};

export default TrackerOrderSummary;
