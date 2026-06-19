import { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, RefreshCw, CheckSquare, Square, Tag, ChevronRight } from 'lucide-react';
import { ORDER_STATUS_OPTIONS, orderStatusLabel } from '../../utils/orderTracking';
import type { BatchOrder } from '../../types';
import { batchStatusColor, peso, itemsSummary, formatDateTime } from './orderStatusStyles';

interface BatchOrdersPanelProps {
  batchNumber: number;
  orders: BatchOrder[];
  loading: boolean;
  busy: boolean;
  onReload: () => void;
  onSelectOrder: (order: BatchOrder) => void;
  onBulkUpdateStatus: (orderIds: string[], status: string) => void;
}

type StatusFilter = 'all' | string;

const FILTER_CHIPS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...ORDER_STATUS_OPTIONS.map((o) => ({ value: o.value as StatusFilter, label: o.label })),
];

// Default bulk target — "advance to next local stage" is the common batch action.
const BULK_TARGETS: readonly { value: string; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'packing', label: 'Packing' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
];

/**
 * Lists every order in the selected batch with a payment-proof thumbnail, a
 * status badge, claim tags, status filter chips, and an opt-in select mode that
 * unlocks bulk status changes (bulkUpdateStatus). Clicking a row opens the
 * detail view via onSelectOrder.
 */
export function BatchOrdersPanel({
  batchNumber,
  orders,
  loading,
  busy,
  onReload,
  onSelectOrder,
  onBulkUpdateStatus,
}: BatchOrdersPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<string>('packing');

  // Clear any selection and leave select mode when the viewed batch changes, so a
  // bulk "Apply" can never fire against stale order IDs from a previously viewed batch.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [batchNumber]);

  const filtered = useMemo(
    () =>
      statusFilter === 'all'
        ? orders
        : orders.filter((order) => order.order_status === statusFilter),
    [orders, statusFilter],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(filtered.map((order) => order.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };

  const handleBulkApply = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Mark ${ids.length} order${ids.length === 1 ? '' : 's'} → ${orderStatusLabel(bulkTarget)}?`,
      )
    ) {
      return;
    }
    onBulkUpdateStatus(ids, bulkTarget);
    exitSelectMode();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <ShoppingCart className="h-4 w-4 text-amber-600" />
          Orders in Batch #{batchNumber} ({orders.length})
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            className={`text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
              selectMode
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-gray-200 text-gray-500 hover:text-gray-900'
            }`}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectMode ? 'Cancel select' : 'Select'}
          </button>
          <button
            type="button"
            onClick={onReload}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
        {FILTER_CHIPS.map((chip) => {
          const count =
            chip.value === 'all'
              ? orders.length
              : orders.filter((o) => o.order_status === chip.value).length;
          const isActive = statusFilter === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => setStatusFilter(chip.value)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                isActive
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {chip.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-indigo-800">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={selectAllVisible}
            className="text-indigo-600 hover:underline"
          >
            Select all visible
          </button>
          {selectedIds.size > 0 && (
            <button type="button" onClick={clearSelection} className="text-gray-500 hover:underline">
              Clear
            </button>
          )}
          <span className="mx-1 text-gray-300">|</span>
          <span className="text-gray-600">Mark selected →</span>
          <select
            value={bulkTarget}
            onChange={(e) => setBulkTarget(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded bg-white text-gray-900"
          >
            {BULK_TARGETS.map((target) => (
              <option key={target.value} value={target.value}>
                {target.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBulkApply}
            disabled={busy || selectedIds.size === 0}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-400">
            {loading ? 'Loading orders…' : 'No orders match this filter.'}
          </p>
        ) : (
          filtered.map((order) => {
            const isSelected = selectedIds.has(order.id);
            const handleRowClick = () => {
              if (selectMode) {
                toggleSelect(order.id);
              } else {
                onSelectOrder(order);
              }
            };
            return (
              <button
                key={order.id}
                type="button"
                onClick={handleRowClick}
                aria-pressed={selectMode ? isSelected : undefined}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                  isSelected ? 'bg-indigo-50/60' : ''
                }`}
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
                    {order.is_claim && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        <Tag className="h-2.5 w-2.5" />
                        Claim
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-700 mt-0.5 truncate">{order.customer_name}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {itemsSummary(order.order_items)}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-gray-900">{peso(order.total_price)}</p>
                  <p className="text-[10px] text-gray-400">{formatDateTime(order.created_at)}</p>
                </div>

                {!selectMode && <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default BatchOrdersPanel;
