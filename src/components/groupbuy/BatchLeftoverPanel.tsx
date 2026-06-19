import { useCallback, useEffect, useState } from 'react';
import { PackageOpen, RefreshCw } from 'lucide-react';
import type { GroupBuyRemainingItem } from '../../types';

interface BatchLeftoverPanelProps {
  batchId: string;
  fetchRemaining: (batchId: string) => Promise<GroupBuyRemainingItem[]>;
}

/**
 * During a FINALIZING batch, shows the per-capped-product leftover surplus:
 * cap, reserved, and remaining claimable units. Customers can claim these
 * leftovers; an admin fulfils a claim by opening the customer's order and adding
 * the units (OrderItemsEditor). Informational, with a manual refresh.
 */
export function BatchLeftoverPanel({ batchId, fetchRemaining }: BatchLeftoverPanelProps) {
  const [items, setItems] = useState<GroupBuyRemainingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchRemaining(batchId);
      setItems(result);
    } catch (err) {
      console.error('Failed to load batch leftovers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leftovers');
    } finally {
      setLoading(false);
    }
  }, [batchId, fetchRemaining]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/60 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <PackageOpen className="h-4 w-4 text-amber-600" />
            Leftover units to claim
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Capped units freed by cancellations are claimable while finalizing. Customers can claim
            them; you fulfil a claim by opening their order and adding the units.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-red-700 text-xs">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-bold text-gray-700">Product</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Cap</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Reserved</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-400">
                  {loading ? 'Loading leftovers…' : 'No claimable leftovers right now.'}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const hasRemaining = item.remaining > 0;
                return (
                  <tr key={item.product_id} className={hasRemaining ? 'bg-amber-50/30' : ''}>
                    <td className="px-4 py-2 text-xs font-semibold text-gray-900">
                      {item.product_name || '(removed product)'}
                      {hasRemaining && (
                        <span className="block text-[10px] font-normal text-amber-600 mt-0.5">
                          Open a customer&apos;s order to add these.
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-gray-600">{item.cap_quantity}</td>
                    <td className="px-4 py-2 text-right text-xs text-gray-600">{item.reserved}</td>
                    <td className="px-4 py-2 text-right text-sm font-bold">
                      <span className={hasRemaining ? 'text-amber-700' : 'text-gray-400'}>
                        {item.remaining}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default BatchLeftoverPanel;
