import { AlertCircle, CheckCircle2, Gauge, ChevronRight, PackageCheck, Recycle } from 'lucide-react';
import type { BatchOrder, GroupBuyBatch, GroupBuyProgressItem } from '../../types';
import type { CapFillSummary } from '../../utils/groupBuyOverview';
import { summarizeResale } from '../../utils/groupBuyOverview';
import { confirmedUnits, pendingUnits } from '../../utils/groupBuy';
import type { RequestConfirm } from './ConfirmDialog';
import { BatchLifecycleBar } from './BatchLifecycleBar';
import { peso, formatDateTime } from './orderStatusStyles';

interface BatchOverviewTabProps {
  batch: GroupBuyBatch | null;
  capSummary: CapFillSummary;
  /** Per-product progress for the batch in view; drives the demand + resale panels. */
  items?: GroupBuyProgressItem[];
  needsAction: BatchOrder[];
  busy: boolean;
  requestConfirm: RequestConfirm;
  onOpenBatch: () => void;
  onOpenNewBatch: () => void;
  onStartFinalizing: (batchId: string) => void;
  onFinalize: (batchId: string) => void;
  onReopen: (batchId: string) => void;
  onClose: (batchId: string) => void;
  onViewOrder: (order: BatchOrder) => void;
  onGoToOrders: () => void;
}

const MAX_PREVIEW = 5;

/** Products with either real demand or a cap — the rows worth showing in the demand panel. */
function demandRows(items: GroupBuyProgressItem[]): GroupBuyProgressItem[] {
  return items
    .filter((item) => item.total_quantity > 0 || item.cap_quantity != null)
    .slice()
    .sort((a, b) => (a.product_name ?? '').localeCompare(b.product_name ?? ''));
}

/**
 * The Overview tab: the batch lifecycle controls, a "needs your attention" queue
 * of orders still to confirm (the admin's main daily job), and a caps-at-a-glance
 * utilisation bar. Everything actionable about the batch in one screen.
 */
export function BatchOverviewTab({
  batch,
  capSummary,
  items = [],
  needsAction,
  busy,
  requestConfirm,
  onOpenBatch,
  onOpenNewBatch,
  onStartFinalizing,
  onFinalize,
  onReopen,
  onClose,
  onViewOrder,
  onGoToOrders,
}: BatchOverviewTabProps) {
  const preview = needsAction.slice(0, MAX_PREVIEW);
  const overflow = needsAction.length - preview.length;
  const rows = demandRows(items);
  const isFinalizing = batch?.status === 'finalizing';
  const resale = isFinalizing ? summarizeResale(items) : null;

  return (
    <div className="space-y-4">
      <BatchLifecycleBar
        batch={batch}
        busy={busy}
        requestConfirm={requestConfirm}
        onOpenBatch={onOpenBatch}
        onOpenNewBatch={onOpenNewBatch}
        onStartFinalizing={onStartFinalizing}
        onFinalize={onFinalize}
        onReopen={onReopen}
        onClose={onClose}
      />

      {batch && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Needs your attention */}
          <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Needs your attention
                {needsAction.length > 0 && (
                  <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {needsAction.length}
                  </span>
                )}
              </h3>
              {needsAction.length > 0 && (
                <button
                  type="button"
                  onClick={onGoToOrders}
                  className="text-xs font-medium text-brand-400 hover:text-brand-500"
                >
                  View all orders
                </button>
              )}
            </div>

            {needsAction.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-sakura-sage" />
                <p className="text-sm font-semibold text-gray-900">You&apos;re all caught up</p>
                <p className="text-xs text-gray-500">No orders are waiting to be confirmed.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {preview.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onViewOrder(order)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-gray-900">{order.customer_name}</p>
                      <p className="truncate text-[11px] text-gray-500">
                        {order.order_number || order.id.slice(0, 8)} · placed{' '}
                        {formatDateTime(order.created_at)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-gray-900">
                      {peso(order.total_price)}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                  </button>
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={onGoToOrders}
                    className="w-full px-4 py-2.5 text-center text-xs font-medium text-brand-400 hover:bg-gray-50"
                  >
                    +{overflow} more to confirm
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Caps at a glance */}
          <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
              <Gauge className="h-4 w-4 text-brand-400" />
              Caps at a glance
            </h3>
            {capSummary.cappedProducts === 0 ? (
              <p className="mt-3 text-xs text-gray-500">
                No caps set for this batch — orders are unlimited. Add caps in the Items &amp; Caps
                tab to limit units per product.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex items-end justify-between">
                    <span className="text-2xl font-bold text-gray-900 leading-none">
                      {capSummary.fillPct}%
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {capSummary.totalReserved} / {capSummary.totalCap} units
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={capSummary.fillPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Cap fill: ${capSummary.fillPct}% — ${capSummary.totalReserved} of ${capSummary.totalCap} units reserved`}
                    className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100"
                  >
                    <div
                      className="h-full rounded-full bg-brand-400 transition-all"
                      style={{ width: `${capSummary.fillPct}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">
                    {capSummary.cappedProducts} capped product{capSummary.cappedProducts === 1 ? '' : 's'}
                  </span>
                  {capSummary.fullProducts > 0 && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-600">
                      {capSummary.fullProducts} full
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Available to resell — only while finalizing, where cancelled units free up. */}
      {batch && resale && resale.itemsToResell.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-emerald-100">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
              <Recycle className="h-4 w-4 text-emerald-600" />
              Available to resell
            </h3>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              {resale.totalResellable} unit{resale.totalResellable === 1 ? '' : 's'}
              {resale.totalFreed > 0 ? ` · ${resale.totalFreed} freed` : ''}
            </span>
          </div>
          <p className="px-4 pt-2 text-[11px] text-gray-500">
            Units you can still hand over to other buyers. Freed counts are cancelled orders already
            included in the resell total — not added on top.
          </p>
          <ul className="divide-y divide-emerald-100">
            {resale.itemsToResell.map((row) => (
              <li
                key={row.product_id}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="min-w-0 truncate text-xs font-semibold text-gray-900">
                  {row.product_name ?? 'Unnamed product'}
                </span>
                <span className="shrink-0 text-xs text-gray-700">
                  <span className="font-bold text-emerald-700">{row.resellable}</span> to sell
                  {row.freed > 0 && (
                    <span className="text-gray-500"> ({row.freed} freed by cancellations)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Demand by item — how many units are ordered per product, confirmed vs pending. */}
      {batch && rows.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
              <PackageCheck className="h-4 w-4 text-brand-400" />
              Demand by item
            </h3>
            <p className="text-[11px] text-gray-500">
              Units already ordered per product — including orders still awaiting confirmation.
            </p>
          </div>
          <ul className="divide-y divide-gray-100">
            {rows.map((item) => {
              const confirmed = confirmedUnits(item);
              const pending = pendingUnits(item);
              const overCap = item.cap_quantity != null && item.total_quantity > item.cap_quantity;
              return (
                <li
                  key={item.product_id}
                  className="flex items-center justify-between gap-3 px-4 py-2"
                >
                  <span className="min-w-0 truncate text-xs font-semibold text-gray-900">
                    {item.product_name ?? 'Unnamed product'}
                  </span>
                  <div className="flex shrink-0 items-center gap-3 text-[11px]">
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      {confirmed} confirmed
                    </span>
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <AlertCircle className="h-3 w-3" />
                      {pending} pending
                    </span>
                    <span
                      className={`font-bold ${overCap ? 'text-red-600' : 'text-gray-900'}`}
                    >
                      {item.total_quantity}
                      {item.cap_quantity != null && ` / ${item.cap_quantity}`}
                      {overCap && ' (over)'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default BatchOverviewTab;
