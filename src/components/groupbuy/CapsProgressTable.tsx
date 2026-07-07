import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Save, Trash2 } from 'lucide-react';
import {
  findProgressItem,
  remainingForProduct,
  remainingForVariation,
  findVariationProgress,
  freedUnits,
  confirmedUnits,
  pendingUnits,
} from '../../utils/groupBuy';
import type { GroupBuyProgressItem } from '../../types';

interface ProductRow {
  id: string;
  name: string;
}

interface VariationRow {
  id: string;
  name: string;
}

interface CapsProgressTableProps {
  rows: ProductRow[];
  items: GroupBuyProgressItem[];
  /** Variations per product id, so each product can be expanded to cap its variations. */
  variationsByProduct: Record<string, VariationRow[]>;
  capDrafts: Record<string, string>;
  busy: boolean;
  /** variationId is null for the product-level cap, or the variation's id. */
  onCapDraftChange: (productId: string, value: string, variationId?: string | null) => void;
  onSaveCap: (productId: string, variationId?: string | null) => void;
  onRemoveCap: (productId: string, variationId?: string | null) => void;
  /** Read-only view (e.g. while a batch is finalizing): show totals but disable cap editing. */
  readOnly?: boolean;
}

/** Order filter chips: "All" shows every product, "With orders" narrows to
 * products that have at least one non-cancelled order in the batch. */
const FILTER_CHIPS: ReadonlyArray<{ label: string; onlyWithOrders: boolean }> = [
  { label: 'All', onlyWithOrders: false },
  { label: 'With orders', onlyWithOrders: true },
];

/** Draft key for a cap input: product-level uses the bare product id; a variation
 * cap namespaces under it. Shared with GroupBuyManager so seeding + writes agree. */
export function capDraftKey(productId: string, variationId?: string | null): string {
  return variationId ? `${productId}:${variationId}` : productId;
}

/** The Cap column editor / read-only value, reused for product and variation rows. */
function CapEditor({
  label,
  draftKey,
  hasCap,
  capValue,
  capDrafts,
  busy,
  readOnly,
  onCapDraftChange,
  onSaveCap,
  onRemoveCap,
}: {
  label: string;
  draftKey: string;
  hasCap: boolean;
  capValue: number | null | undefined;
  capDrafts: Record<string, string>;
  busy: boolean;
  readOnly: boolean;
  onCapDraftChange: (value: string) => void;
  onSaveCap: () => void;
  onRemoveCap: () => void;
}) {
  if (readOnly) {
    return (
      <span className="text-xs text-gray-700">
        {hasCap ? capValue : <span className="text-gray-400">No cap</span>}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={1}
        step={1}
        value={capDrafts[draftKey] ?? ''}
        onChange={(e) => onCapDraftChange(e.target.value)}
        placeholder="—"
        aria-label={`Cap for ${label}`}
        className="w-20 px-2 py-1 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button
        type="button"
        onClick={onSaveCap}
        disabled={busy}
        title="Save cap"
        aria-label={`Save cap for ${label}`}
        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" />
      </button>
      {hasCap && (
        <button
          type="button"
          onClick={onRemoveCap}
          disabled={busy}
          title="Remove cap"
          aria-label={`Remove cap for ${label}`}
          className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Remaining cell content shared by product and variation rows. */
function RemainingCell({ remaining, cap }: { remaining: number | null; cap: number | null | undefined }) {
  if (remaining == null) return <span className="text-gray-400">No cap</span>;
  if (remaining === 0) return <span className="font-bold text-red-600">Full</span>;
  return (
    <span className="font-medium text-gray-700">
      {remaining} of {cap}
    </span>
  );
}

/**
 * Per-product order totals and the optional cap editor for the OPEN batch. Each
 * product with variations can be expanded to set a cap per variation — a variation
 * cap OVERRIDES the product cap for that variation; uncapped variations share the
 * product-level cap. Cap math comes from the pure groupBuy utils so the storefront
 * and admin agree on remaining counts.
 */
export function CapsProgressTable({
  rows,
  items,
  variationsByProduct,
  capDrafts,
  busy,
  onCapDraftChange,
  onSaveCap,
  onRemoveCap,
  readOnly = false,
}: CapsProgressTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [onlyWithOrders, setOnlyWithOrders] = useState(false);

  const toggle = (productId: string) =>
    setExpanded((prev) => ({ ...prev, [productId]: !prev[productId] }));

  const hasOrders = (productId: string) => (findProgressItem(items, productId)?.order_count ?? 0) > 0;
  const withOrdersCount = rows.filter((product) => hasOrders(product.id)).length;
  const visibleRows = onlyWithOrders ? rows.filter((product) => hasOrders(product.id)) : rows;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">Orders per item</h3>
        <p className="text-xs text-gray-500">
          Totals sum non-cancelled orders in this batch. Set an optional cap to limit how many units
          can be ordered. Expand a product to cap individual variations — a variation cap overrides
          the product cap for that variation. Cancelled units are freed back as claimable leftovers.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {FILTER_CHIPS.map((chip) => {
            const isActive = onlyWithOrders === chip.onlyWithOrders;
            const count = chip.onlyWithOrders ? withOrdersCount : rows.length;
            return (
              <button
                key={chip.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => setOnlyWithOrders(chip.onlyWithOrders)}
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
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-bold text-gray-700">Product</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Total Qty</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Confirmed</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Pending</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Orders</th>
              <th className="px-4 py-2 text-right text-xs font-bold text-gray-700">Cancelled</th>
              <th className="px-4 py-2 text-left text-xs font-bold text-gray-700">Cap (optional)</th>
              <th className="px-4 py-2 text-left text-xs font-bold text-gray-700">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleRows.map((product) => {
              const item = findProgressItem(items, product.id);
              const total = item?.total_quantity ?? 0;
              const confirmed = item ? confirmedUnits(item) : 0;
              const pending = item ? pendingUnits(item) : 0;
              const orderCount = item?.order_count ?? 0;
              const cancelled = item ? freedUnits(item) : 0;
              const remaining = remainingForProduct(item);
              const hasCap = item?.cap_quantity != null;
              const variations = variationsByProduct[product.id] ?? [];
              const isExpandable = variations.length > 0;
              const isOpen = !!expanded[product.id];
              return (
                <Fragment key={product.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs font-semibold text-gray-900">
                      <div className="flex items-center gap-1.5">
                        {isExpandable ? (
                          <button
                            type="button"
                            onClick={() => toggle(product.id)}
                            aria-label={`${isOpen ? 'Collapse' : 'Expand'} variations for ${product.name}`}
                            aria-expanded={isOpen}
                            className="p-0.5 text-gray-500 hover:text-gray-800"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="inline-block w-4" />
                        )}
                        {product.name}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">{total}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-emerald-700">{confirmed}</td>
                    <td className="px-4 py-2 text-right text-xs">
                      {pending > 0 ? (
                        <span className="font-semibold text-amber-600">{pending}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-gray-600">{orderCount}</td>
                    <td className="px-4 py-2 text-right text-xs">
                      {cancelled > 0 ? (
                        <span className="font-semibold text-amber-600">{cancelled}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <CapEditor
                        label={product.name}
                        draftKey={capDraftKey(product.id)}
                        hasCap={hasCap}
                        capValue={item?.cap_quantity}
                        capDrafts={capDrafts}
                        busy={busy}
                        readOnly={readOnly}
                        onCapDraftChange={(value) => onCapDraftChange(product.id, value)}
                        onSaveCap={() => onSaveCap(product.id)}
                        onRemoveCap={() => onRemoveCap(product.id)}
                      />
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <RemainingCell remaining={remaining} cap={item?.cap_quantity} />
                    </td>
                  </tr>
                  {isOpen &&
                    variations.map((variation) => {
                      const vProgress = findVariationProgress(item, variation.id);
                      const vTotal = vProgress?.total_quantity ?? 0;
                      const vHasCap = vProgress?.cap_quantity != null;
                      const vRemaining = remainingForVariation(item, variation.id);
                      const label = `${product.name} — ${variation.name}`;
                      return (
                        <tr key={`${product.id}:${variation.id}`} className="bg-gray-50/60">
                          <td className="px-4 py-1.5 text-xs text-gray-600">
                            <span className="pl-8">↳ {variation.name}</span>
                          </td>
                          <td className="px-4 py-1.5 text-right text-xs font-semibold text-gray-700">{vTotal}</td>
                          <td className="px-4 py-1.5" />
                          <td className="px-4 py-1.5" />
                          <td className="px-4 py-1.5" />
                          <td className="px-4 py-1.5" />
                          <td className="px-4 py-1.5">
                            <CapEditor
                              label={label}
                              draftKey={capDraftKey(product.id, variation.id)}
                              hasCap={vHasCap}
                              capValue={vProgress?.cap_quantity}
                              capDrafts={capDrafts}
                              busy={busy}
                              readOnly={readOnly}
                              onCapDraftChange={(value) => onCapDraftChange(product.id, value, variation.id)}
                              onSaveCap={() => onSaveCap(product.id, variation.id)}
                              onRemoveCap={() => onRemoveCap(product.id, variation.id)}
                            />
                          </td>
                          <td className="px-4 py-1.5 text-xs">
                            <RemainingCell remaining={vRemaining} cap={vProgress?.cap_quantity} />
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-xs text-gray-400">
                  {onlyWithOrders ? 'No items with orders yet.' : 'No products found.'}
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
