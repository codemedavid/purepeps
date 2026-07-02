import { CheckSquare, Square, Tag, ChevronRight } from 'lucide-react';
import { orderStatusLabel } from '../../utils/orderTracking';
import type { BatchOrder } from '../../types';
import { batchStatusColor, peso, itemsSummary, formatDateTime } from './orderStatusStyles';

interface BatchOrderRowProps {
  order: BatchOrder;
  /** "Order 2" when the row sits inside a multi-order group; omitted for lone orders. */
  sequenceLabel?: string;
  selectMode: boolean;
  isSelected: boolean;
  onActivate: (order: BatchOrder) => void;
  onToggleSelect: (id: string) => void;
  /** Indent + payment pill for a sub-row nested under a group header. */
  nested?: boolean;
}

const PAYMENT_PILL: Readonly<Record<string, { label: string; className: string }>> = {
  paid: { label: 'Paid', className: 'bg-green-100 text-green-700' },
  submitted: { label: 'Under review', className: 'bg-blue-100 text-blue-700' },
};
const PAYMENT_PILL_DEFAULT = { label: 'Pending', className: 'bg-amber-100 text-amber-700' };

/**
 * One clickable order row, shared by the flat single-order list and the numbered
 * sub-rows inside a grouped card. A nested row leads with its sequence label
 * ("Order 2") and a payment pill so each order's payment stays visible at a
 * glance; a lone row keeps the original layout untouched.
 */
export function BatchOrderRow({
  order,
  sequenceLabel,
  selectMode,
  isSelected,
  onActivate,
  onToggleSelect,
  nested = false,
}: BatchOrderRowProps) {
  const handleClick = () => {
    if (selectMode) {
      onToggleSelect(order.id);
    } else {
      onActivate(order);
    }
  };

  const payment = PAYMENT_PILL[order.payment_status] ?? PAYMENT_PILL_DEFAULT;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={selectMode ? isSelected : undefined}
      className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-indigo-50/60' : ''
      } ${nested ? 'pl-8' : ''}`}
    >
      {selectMode && (
        <span className="shrink-0 text-indigo-600">
          <span className="sr-only">{isSelected ? 'Selected' : 'Not selected'}</span>
          {isSelected ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4 text-gray-300" />
          )}
        </span>
      )}

      {order.payment_proof_url ? (
        <img
          src={order.payment_proof_url}
          alt="Proof"
          className="h-10 w-10 rounded object-cover border border-gray-200 shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded bg-gray-100 border border-gray-200 shrink-0 flex items-center justify-center text-[9px] text-gray-400">
          no proof
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {sequenceLabel && (
            <span className="text-xs font-bold text-indigo-700">{sequenceLabel}</span>
          )}
          <span className="text-xs font-bold text-gray-900 font-mono">
            {order.order_number || order.id.slice(0, 8)}
          </span>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${batchStatusColor(
              order.order_status,
            )}`}
          >
            {orderStatusLabel(order.order_status)}
          </span>
          {nested && (
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${payment.className}`}
            >
              {payment.label}
            </span>
          )}
          {order.is_claim && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              <Tag className="h-2.5 w-2.5" />
              Claim
            </span>
          )}
        </div>
        {!nested && <p className="text-xs text-gray-700 mt-0.5 truncate">{order.customer_name}</p>}
        <p className="text-[11px] text-gray-500 truncate">{itemsSummary(order.order_items)}</p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-gray-900">{peso(order.total_price)}</p>
        <p className="text-[10px] text-gray-400">{formatDateTime(order.created_at)}</p>
      </div>

      {!selectMode && <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />}
    </button>
  );
}

export default BatchOrderRow;
