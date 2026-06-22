import { CheckCircle2, AlertCircle, LayoutGrid } from 'lucide-react';
import type { BatchPhase } from '../../utils/groupBuy';
import { summarizeDemand } from '../../utils/groupBuyOverview';
import type { GroupBuyProgressItem } from '../../types';

type Props = {
  items: GroupBuyProgressItem[];
  phase: BatchPhase;
};

/** Phase-driven one-liner that tells the admin what the headline column means now. */
function phaseHint(phase: BatchPhase): string {
  if (phase === 'open')
    return 'Buying is open — "Left" is how many more units fit under each cap before it sells out.';
  if (phase === 'finalizing')
    return 'Finalizing — "To take over" is what cancellations freed up for other buyers to claim.';
  return 'Locked in — "Confirmed" is the unit count heading to the supplier and shipping.';
}

/** Tailwind accents for the headline number, by phase, so it reads at a glance. */
function highlightTone(phase: BatchPhase): string {
  if (phase === 'finalizing') return 'text-emerald-700';
  if (phase === 'finalized' || phase === 'closed') return 'text-brand-500';
  return 'text-gray-900';
}

/**
 * The single product status board on the Overview. Consolidates per-item demand
 * (ordered, confirmed vs pending) with the phase-relevant headline the admin needs
 * fastest — units still orderable while open, units freed to resell while
 * finalizing, confirmed units once locked. No charts, no new dependency.
 */
export function ProductStatusBoard({ items, phase }: Props) {
  const summary = summarizeDemand(items, phase);
  if (summary.rows.length === 0) return null;

  const tone = highlightTone(phase);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <LayoutGrid className="h-4 w-4 text-brand-400" />
          Product status board
        </h3>
        <p className="text-[11px] text-gray-500">{phaseHint(phase)}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-bold text-gray-700">Product</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Ordered</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Confirmed</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Pending</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Cap</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">
                {summary.highlightLabel}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.rows.map((row) => (
              <tr key={row.product_id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-xs font-semibold text-gray-900">
                  {row.product_name ?? 'Unnamed product'}
                </td>
                <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                  {row.ordered}
                  {row.overCap && <span className="ml-1 text-[10px] font-bold text-red-600">over</span>}
                </td>
                <td className="px-4 py-2 text-right text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    {row.confirmed}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-xs">
                  {row.pending > 0 ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                      <AlertCircle className="h-3 w-3" />
                      {row.pending}
                    </span>
                  ) : (
                    <span className="text-gray-300">0</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right text-xs text-gray-600">
                  {row.cap ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2 text-right text-sm">
                  {row.highlight == null ? (
                    <span className="text-xs text-gray-400">No cap</span>
                  ) : (
                    <span className={`font-bold ${row.highlight === 0 ? 'text-red-600' : tone}`}>
                      {row.highlight === 0 ? 'Full' : row.highlight}
                      {phase === 'finalizing' && row.freed > 0 && (
                        <span className="ml-1 text-[10px] font-medium text-gray-500">
                          ({row.freed} freed)
                        </span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td className="px-4 py-2 text-xs font-bold text-gray-700">All items</td>
              <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                {summary.totalOrdered}
              </td>
              <td className="px-4 py-2 text-right text-xs font-semibold text-emerald-700">
                {summary.totalConfirmed}
              </td>
              <td className="px-4 py-2 text-right text-xs font-semibold text-amber-600">
                {summary.totalPending}
              </td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                {summary.totalHighlight}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default ProductStatusBoard;
