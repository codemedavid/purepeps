import { AlertTriangle, Boxes, Lock, RefreshCw, Eye } from 'lucide-react';
import type { KitAllocationPreview, KitAllocationRow } from '../../types';
import { peso } from './orderStatusStyles';

interface KitAllocationPanelProps {
  preview: KitAllocationPreview | null;
  /** True once the batch's allocation has been locked; locking is then closed. */
  locked: boolean;
  loading: boolean;
  error: string | null;
  onPreview: () => void;
  onLock: () => void;
  onRecalculate: () => void;
}

const LOCK_WARNING =
  'Lock this kit allocation?\n\n' +
  'This creates Ligwak records and refund obligations against the named ' +
  'customers, and freezes who is in the incomplete kit. Changing it afterwards ' +
  'needs an explicit recalculation.';

const RECALCULATE_WARNING =
  'Recalculate this locked allocation?\n\n' +
  'Customers may move in or out of the incomplete kit. This is blocked once any ' +
  'refund is processing or paid.';

function kitRange(first: number, last: number): string {
  return first === last ? `Kit ${first}` : `Kits ${first}–${last}`;
}

/**
 * The admin's look at a group buy's kit allocation BEFORE anything is committed.
 *
 * Answers the two questions asked before approving: which customers and
 * quantities completed each kit, and who is carrying the incomplete one. The
 * money owed is shown up front, because that is what locking actually commits
 * the business to.
 *
 * Locking is confirmation-gated. It is not a save button — it creates refund
 * obligations against named people and freezes the ledger.
 */
export function KitAllocationPanel({
  preview,
  locked,
  loading,
  error,
  onPreview,
  onLock,
  onRecalculate,
}: KitAllocationPanelProps) {
  const allocations = preview?.allocations ?? [];
  const totals = preview?.totals;
  const hasLigwak = (totals?.ligwak_vials ?? 0) > 0;

  const confirmThen = (message: string, action: () => void) => () => {
    if (window.confirm(message)) action();
  };

  return (
    <section className="space-y-4" aria-labelledby="kit-allocation-heading">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            id="kit-allocation-heading"
            className="flex items-center gap-2 text-base font-bold text-gray-900"
          >
            <Boxes className="h-5 w-5 text-brand-500" aria-hidden="true" />
            Kit Allocation
            {locked && (
              <span className="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                Locked
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Vials are packed oldest order first. Whatever falls outside a complete kit is
            Ligwak.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPreview}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            Preview
          </button>

          {locked ? (
            <button
              type="button"
              onClick={confirmThen(RECALCULATE_WARNING, onRecalculate)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Recalculate
            </button>
          ) : (
            <button
              type="button"
              onClick={confirmThen(LOCK_WARNING, onLock)}
              disabled={loading || !preview}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              Lock allocation
            </button>
          )}
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {totals && (
        <dl className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Affected orders
            </dt>
            <dd className="mt-0.5 text-xl font-bold text-gray-900">{totals.affected_orders}</dd>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Ligwak vials
            </dt>
            <dd data-testid="total-ligwak" className="mt-0.5 text-xl font-bold text-amber-800">
              {totals.ligwak_vials}
            </dd>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Refund owed
            </dt>
            <dd className="mt-0.5 text-xl font-bold text-gray-900">
              {peso(totals.refund_owed)}
            </dd>
          </div>
        </dl>
      )}

      {!hasLigwak && preview && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">
          No Ligwak — every confirmed vial landed in a complete kit.
        </p>
      )}

      {allocations.map((allocation) => (
        <AllocationCard
          key={`${allocation.product_id}:${allocation.variation_id ?? ''}`}
          allocation={allocation}
        />
      ))}
    </section>
  );
}

function AllocationCard({ allocation }: { allocation: KitAllocationRow }) {
  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-gray-100 bg-gray-50 px-3 py-2.5">
        <h4 className="text-sm font-bold text-gray-900">
          {allocation.product_name ?? 'Unnamed product'}
          {allocation.variation_name && (
            <span className="ml-1.5 font-normal text-gray-500">{allocation.variation_name}</span>
          )}
        </h4>
        <p className="flex items-center gap-3 text-xs text-gray-600">
          <span>{allocation.kit_size} vials per kit</span>
          <span>
            <span data-testid="complete-kits" className="font-bold text-green-700">
              {allocation.complete_kits}
            </span>{' '}
            complete
          </span>
          <span>
            <span data-testid="ligwak-vials" className="font-bold text-amber-700">
              {allocation.ligwak_vials}
            </span>{' '}
            ligwak
          </span>
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only">
            Orders packed into kits for {allocation.product_name ?? 'this product'}, oldest first
          </caption>
          <thead>
            <tr className="border-b border-gray-100 text-left">
              {['#', 'Customer', 'Order', 'Vials', 'Confirmed', 'Ligwak', 'Kit'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allocation.entries.map((entry) => (
              <tr
                key={entry.order_id}
                className={`border-b border-gray-50 last:border-0 ${
                  entry.ligwak_qty > 0 ? 'bg-amber-50/60' : ''
                }`}
              >
                <td className="px-3 py-2 tabular-nums text-gray-400">{entry.sequence + 1}</td>
                <td className="px-3 py-2 font-medium text-gray-900">
                  {entry.customer_name ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-600">
                  {entry.order_number ?? '—'}
                </td>
                <td className="px-3 py-2 tabular-nums text-gray-700">{entry.quantity}</td>
                <td className="px-3 py-2 font-semibold tabular-nums text-green-700">
                  {entry.confirmed_qty}
                </td>
                <td className="px-3 py-2 font-bold tabular-nums text-amber-700">
                  {entry.ligwak_qty > 0 ? (
                    <span title="Ligwak — outside a complete kit">{entry.ligwak_qty} ligwak</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                  {kitRange(entry.first_kit_index, entry.last_kit_index)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default KitAllocationPanel;
