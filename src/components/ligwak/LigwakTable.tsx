import { BellRing, Receipt } from 'lucide-react';
import type { LigwakRecord } from '../../types';
import { ligwakRefundStatusColor, ligwakRefundStatusLabel } from '../../constants/ligwak';
import { paymentStatusLabel, paymentTypeLabel } from '../../constants/payment';
import { peso } from '../groupbuy/orderStatusStyles';

interface LigwakTableProps {
  records: readonly LigwakRecord[];
  onOpenRefund: (record: LigwakRecord) => void;
}

const HEADINGS = [
  'Customer',
  'Order',
  'Product',
  'Total',
  'Confirmed',
  'Ligwak',
  'Refund',
  'Payment',
  'Refund status',
  '',
];

function orderedOn(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * The Ligwak Management list: every customer left holding vials from an
 * incomplete kit, and what is owed to them.
 *
 * Quantities are given three separate cells — ordered, confirmed, ligwak —
 * rather than one "3 of 5" string, because the difference between them is the
 * difference between a partial refund and a cancelled order, and it is the
 * number an admin double-checks before sending money.
 *
 * Every stored token is rendered through its label helper, so the page never
 * shows an admin a raw `pay_now` or `for_review`.
 */
export function LigwakTable({ records, onOpenRefund }: LigwakTableProps) {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm font-medium text-gray-600">No Ligwak records for this group buy.</p>
        <p className="mt-1 text-xs text-gray-500">
          Every confirmed vial landed in a complete kit.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[68rem] border-collapse text-sm">
        <caption className="sr-only">
          Customers with vials left outside a complete kit, and the refunds owed to them
        </caption>
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            {HEADINGS.map((heading, index) => (
              <th
                key={heading || `actions-${index}`}
                scope="col"
                className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-500"
              >
                {heading || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <td className="px-3 py-2.5 align-top">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-900">{record.customer_name}</span>
                  {record.customer_notified_at && (
                    <span title="Customer notified" className="inline-flex shrink-0">
                      <BellRing className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                      <span className="sr-only">Customer notified</span>
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{record.customer_email}</div>
                <div className="text-xs text-gray-500">{record.customer_phone ?? '—'}</div>
              </td>

              <td className="whitespace-nowrap px-3 py-2.5 align-top">
                <div className="font-mono text-xs font-semibold text-gray-900">
                  {record.order_number ?? '—'}
                </div>
                <div className="text-xs text-gray-500">{record.batch_label ?? '—'}</div>
                <div className="text-xs text-gray-500">{orderedOn(record.ordered_at)}</div>
              </td>

              <td className="px-3 py-2.5 align-top">
                <div className="font-medium text-gray-900">{record.product_name ?? '—'}</div>
                <div className="text-xs text-gray-500">
                  {record.variation_name ?? '—'}
                  {record.quantity_mg != null && ` · ${record.quantity_mg}mg`}
                </div>
              </td>

              <td data-testid="total-qty" className="px-3 py-2.5 align-top tabular-nums text-gray-700">
                {record.total_quantity}
              </td>
              <td
                data-testid="confirmed-qty"
                className="px-3 py-2.5 align-top font-semibold tabular-nums text-green-700"
              >
                {record.confirmed_quantity}
              </td>
              <td
                data-testid="ligwak-qty"
                className="px-3 py-2.5 align-top font-bold tabular-nums text-amber-700"
              >
                {record.ligwak_quantity}
              </td>

              <td className="whitespace-nowrap px-3 py-2.5 align-top font-semibold text-gray-900">
                {peso(record.refund_amount)}
                {record.shipping_refunded > 0 && (
                  <div className="text-[11px] font-normal text-gray-500">
                    incl. {peso(record.shipping_refunded)} shipping
                  </div>
                )}
              </td>

              <td className="whitespace-nowrap px-3 py-2.5 align-top">
                <div className="text-xs font-medium text-gray-900">
                  {paymentTypeLabel(record.payment_type)}
                </div>
                <div className="text-xs text-gray-500">
                  {paymentStatusLabel(record.payment_status, record.payment_type)}
                </div>
              </td>

              <td className="whitespace-nowrap px-3 py-2.5 align-top">
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ligwakRefundStatusColor(
                    record.refund_status,
                  )}`}
                >
                  {ligwakRefundStatusLabel(record.refund_status)}
                </span>
                {record.refund_reference && (
                  <div className="mt-1 font-mono text-[11px] text-gray-500">
                    {record.refund_reference}
                  </div>
                )}
              </td>

              <td className="whitespace-nowrap px-3 py-2.5 align-top text-right">
                <button
                  type="button"
                  onClick={() => onOpenRefund(record)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                  Refund
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LigwakTable;
