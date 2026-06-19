import { Save, Trash2 } from 'lucide-react';
import { findProgressItem, remainingForProduct, freedUnits } from '../../utils/groupBuy';
import type { GroupBuyProgressItem } from '../../types';

interface ProductRow {
  id: string;
  name: string;
}

interface CapsProgressTableProps {
  rows: ProductRow[];
  items: GroupBuyProgressItem[];
  capDrafts: Record<string, string>;
  busy: boolean;
  onCapDraftChange: (productId: string, value: string) => void;
  onSaveCap: (productId: string) => void;
  onRemoveCap: (productId: string) => void;
  /** Read-only view (e.g. while a batch is finalizing): show totals but disable cap editing. */
  readOnly?: boolean;
}

/**
 * Per-product order totals and the optional cap editor for the OPEN batch.
 * Surfaces non-cancelled totals, order count, freed (cancelled) units, the cap
 * input, and remaining capacity. Cap math comes from the pure groupBuy utils so
 * the storefront and admin agree on remaining counts.
 */
export function CapsProgressTable({
  rows,
  items,
  capDrafts,
  busy,
  onCapDraftChange,
  onSaveCap,
  onRemoveCap,
  readOnly = false,
}: CapsProgressTableProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">Orders per item</h3>
        <p className="text-xs text-gray-500">
          Totals sum non-cancelled orders in this batch. Set an optional cap to limit how many units
          can be ordered. Cancelled units are freed back as claimable leftovers.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-bold text-gray-700">Product</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Total Qty</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Orders</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Cancelled</th>
              <th className="px-4 py-2 text-left text-xs font-bold text-gray-700">Cap (optional)</th>
              <th className="px-4 py-2 text-left text-xs font-bold text-gray-700">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((product) => {
              const item = findProgressItem(items, product.id);
              const total = item?.total_quantity ?? 0;
              const orderCount = item?.order_count ?? 0;
              const cancelled = item ? freedUnits(item) : 0;
              const remaining = remainingForProduct(item);
              const hasCap = item?.cap_quantity != null;
              return (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-xs font-semibold text-gray-900">{product.name}</td>
                  <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">{total}</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-600">{orderCount}</td>
                  <td className="px-4 py-2 text-right text-xs">
                    {cancelled > 0 ? (
                      <span className="font-semibold text-amber-600">{cancelled}</span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {readOnly ? (
                      <span className="text-xs text-gray-700">
                        {hasCap ? item?.cap_quantity : <span className="text-gray-400">No cap</span>}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={capDrafts[product.id] ?? ''}
                          onChange={(e) => onCapDraftChange(product.id, e.target.value)}
                          placeholder="—"
                          aria-label={`Cap for ${product.name}`}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => onSaveCap(product.id)}
                          disabled={busy}
                          title="Save cap"
                          aria-label={`Save cap for ${product.name}`}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </button>
                        {hasCap && (
                          <button
                            type="button"
                            onClick={() => onRemoveCap(product.id)}
                            disabled={busy}
                            title="Remove cap"
                            aria-label={`Remove cap for ${product.name}`}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {remaining == null ? (
                      <span className="text-gray-400">No cap</span>
                    ) : remaining === 0 ? (
                      <span className="font-bold text-red-600">Full</span>
                    ) : (
                      <span className="font-medium text-gray-700">
                        {remaining} of {item?.cap_quantity}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-xs text-gray-400">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CapsProgressTable;
