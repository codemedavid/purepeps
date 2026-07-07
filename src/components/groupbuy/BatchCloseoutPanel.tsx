import { Fragment, useState } from 'react';
import { ClipboardCheck, Copy, Download, PackageCheck, Receipt, Truck } from 'lucide-react';
import type { BatchOrder, FulfillmentStage } from '../../types';
import type { ItemRevenueSummary, VariationBreakdownRow } from '../../utils/groupBuyOverview';
import { summarizeVariationBreakdown } from '../../utils/groupBuyOverview';
import { buildBatchCloseoutCsv } from '../../utils/batchCloseoutExport';
import { buildItemsByVariationCsv } from '../../utils/batchExports';
import { downloadCsv } from '../../utils/downloadCsv';
import { fulfillmentStageLabel } from '../../utils/orderTracking';
import { peso } from './orderStatusStyles';
import { KitCell } from './KitCell';

type Props = {
  /** Per-item closeout derived from the batch's orders. */
  summary: ItemRevenueSummary;
  /** Every order on the batch — exported alongside the item breakdown. */
  orders: BatchOrder[];
  /** Batch-wide international shipping leg, shown as the headline shipping status. */
  fulfillmentStage: FulfillmentStage | null;
  /** Batch number, used only to name the downloaded CSV file. */
  batchNumber?: number;
};

const CANCELLED = 'cancelled';
const NEW = 'new';

type ShipReadiness = {
  ready: number;
  awaiting: number;
  cancelled: number;
};

function shipReadiness(orders: BatchOrder[]): ShipReadiness {
  return orders.reduce<ShipReadiness>(
    (acc, order) => {
      if (order.order_status === CANCELLED) return { ...acc, cancelled: acc.cancelled + 1 };
      if (order.order_status === NEW) return { ...acc, awaiting: acc.awaiting + 1 };
      return { ...acc, ready: acc.ready + 1 };
    },
    { ready: 0, awaiting: 0, cancelled: 0 },
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path below
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * End-of-group-buy closeout: the per-item breakdown (orders, units, confirmed vs
 * pending, gross vs collected revenue) plus a shipping-readiness summary and a
 * one-click CSV copy for accounting and supplier ordering. Derived entirely from
 * the batch's orders so it stays accurate after the batch is finalized/closed.
 */
export function BatchCloseoutPanel({ summary, orders, fulfillmentStage, batchNumber }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  if (summary.rows.length === 0) return null;

  const readiness = shipReadiness(orders);
  const variationsByProduct: Map<string, VariationBreakdownRow[]> = summarizeVariationBreakdown(orders);
  const batchTag = batchNumber != null ? `-batch-${batchNumber}` : '';

  const handleCopy = async () => {
    const ok = await copyToClipboard(buildBatchCloseoutCsv(summary, orders));
    setCopyState(ok ? 'copied' : 'error');
    window.setTimeout(() => setCopyState('idle'), 2500);
  };

  const handleDownloadItems = () => {
    downloadCsv(`group-buy-items${batchTag}.csv`, buildItemsByVariationCsv(orders));
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <Receipt className="h-4 w-4 text-brand-400" />
          Group buy closeout
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadItems}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            title="Download every product/variation with its kit total as a CSV"
          >
            <Download className="h-3.5 w-3.5" />
            Items CSV
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            {copyState === 'copied' ? (
              <>
                <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                {copyState === 'error' ? 'Copy failed' : 'Copy CSV'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Shipping readiness — confirmed orders ready to fulfil vs still awaiting. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-b border-gray-100 text-xs">
        <span className="inline-flex items-center gap-1.5 text-gray-700">
          <Truck className="h-3.5 w-3.5 text-brand-400" />
          Shipping:{' '}
          <span className="font-semibold text-gray-900">
            {fulfillmentStageLabel(fulfillmentStage) || 'Not yet shipped'}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <PackageCheck className="h-3.5 w-3.5" />
          <span className="font-semibold">{readiness.ready}</span> ready
        </span>
        {readiness.awaiting > 0 && (
          <span className="font-semibold text-amber-600">{readiness.awaiting} awaiting confirmation</span>
        )}
        {readiness.cancelled > 0 && (
          <span className="text-gray-400">{readiness.cancelled} cancelled</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-bold text-gray-700">Product</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Orders</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Ordered</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Confirmed</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Pending</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Gross</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.rows.map((row) => {
              // A single variation would just repeat the parent row's numbers — only
              // worth a breakdown when there's more than one to actually compare.
              const allVariations = variationsByProduct.get(row.product_id) ?? [];
              const variations = allVariations.length > 1 ? allVariations : [];
              return (
                <Fragment key={row.product_id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs font-semibold text-gray-900">
                      {row.product_name ?? 'Unnamed product'}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-gray-600">{row.orderCount}</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                      <KitCell vials={row.unitsOrdered} />
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-emerald-700">
                      {row.unitsConfirmed}
                    </td>
                    <td className="px-4 py-2 text-right text-xs">
                      {row.unitsPending > 0 ? (
                        <span className="font-semibold text-amber-600">{row.unitsPending}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-gray-600">{peso(row.grossRevenue)}</td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-gray-900">
                      {peso(row.collectedRevenue)}
                    </td>
                  </tr>
                  {variations.map((variation) => (
                    <tr
                      key={`${row.product_id}-${variation.variation_id ?? 'standard'}`}
                      className="bg-gray-50/50"
                    >
                      <td className="px-4 py-1.5 pl-8 text-[11px] text-gray-600">
                        {variation.variation_name}
                      </td>
                      <td className="px-4 py-1.5 text-right text-[11px] text-gray-500">
                        {variation.orderCount} order{variation.orderCount === 1 ? '' : 's'}
                      </td>
                      <td className="px-4 py-1.5 text-right text-xs font-medium text-gray-700">
                        <KitCell vials={variation.unitsOrdered} />
                      </td>
                      <td className="px-4 py-1.5 text-right text-[11px] text-gray-500">
                        {variation.unitsConfirmed}
                      </td>
                      <td className="px-4 py-1.5 text-right text-[11px] text-gray-500">
                        {variation.unitsPending}
                      </td>
                      <td className="px-4 py-1.5" />
                      <td className="px-4 py-1.5" />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td className="px-4 py-2 text-xs font-bold text-gray-700">All items</td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                <KitCell vials={summary.totalUnitsOrdered} />
              </td>
              <td className="px-4 py-2 text-right text-xs font-semibold text-emerald-700">
                {summary.totalUnitsConfirmed}
              </td>
              <td className="px-4 py-2 text-right text-xs font-semibold text-amber-600">
                {summary.totalUnitsPending}
              </td>
              <td className="px-4 py-2 text-right text-xs font-semibold text-gray-700">
                {peso(summary.totalGrossRevenue)}
              </td>
              <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                {peso(summary.totalCollectedRevenue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default BatchCloseoutPanel;
