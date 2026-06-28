import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';
import type { OrderLineItem, Product, ProductVariation } from '../../types';

interface OrderItemsEditorProps {
  items: OrderLineItem[];
  products: Product[];
  busy?: boolean;
  onSave: (items: OrderLineItem[]) => void | Promise<void>;
}

const peso = (value: number): string =>
  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

/** Effective unit price for a product: discounted when active, else base. */
function effectivePrice(product: Product): number {
  return product.discount_active && product.discount_price
    ? product.discount_price
    : product.base_price;
}

/** Effective unit price for a variation: discounted when active, else base. */
function effectiveVariationPrice(variation: ProductVariation): number {
  return variation.discount_active && variation.discount_price
    ? variation.discount_price
    : variation.price;
}

function lineTotal(price: number, quantity: number): number {
  return Math.round(price * quantity * 100) / 100;
}

/**
 * Edits the order_items of a single group-buy order: change a line's quantity,
 * remove a line, or add a product (with auto price from its effective price).
 * This powers "admin adds the claimed units onto a customer's order". Saving
 * recomputes each line total and hands the new array up to saveItems().
 */
export function OrderItemsEditor({ items, products, busy = false, onSave }: OrderItemsEditorProps) {
  const [draft, setDraft] = useState<OrderLineItem[]>(items);
  const [addProductId, setAddProductId] = useState<string>('');
  const [addVariationId, setAddVariationId] = useState<string>('');
  const [addQty, setAddQty] = useState<string>('1');

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === addProductId),
    [products, addProductId],
  );
  const selectedVariations = selectedProduct?.variations ?? [];
  const hasVariations = selectedVariations.length > 0;

  const subtotal = useMemo(
    () => draft.reduce((sum, item) => sum + (item.total ?? 0), 0),
    [draft],
  );

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(items), [draft, items]);

  const handleQtyChange = (index: number, rawValue: string) => {
    const quantity = Math.max(1, Math.floor(Number(rawValue) || 1));
    setDraft((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, quantity, total: lineTotal(item.price, quantity) } : item,
      ),
    );
  };

  const handleRemove = (index: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Switch the product to add, defaulting the variation to the first in-stock
   * one. Leaves the variation empty when none are in stock so the admin must
   * make an explicit choice (and "Add" stays disabled).
   */
  const handleProductChange = (productId: string) => {
    setAddProductId(productId);
    const variations = products.find((p) => p.id === productId)?.variations ?? [];
    const firstInStock = variations.find((v) => v.stock_quantity > 0);
    setAddVariationId(firstInStock?.id ?? '');
  };

  const handleAdd = () => {
    const product = products.find((p) => p.id === addProductId);
    if (!product) return;
    const variations = product.variations ?? [];
    // Products with variations require one before a line can be added.
    const variation = variations.length > 0
      ? variations.find((v) => v.id === addVariationId)
      : undefined;
    if (variations.length > 0 && !variation) return;
    const quantity = Math.max(1, Math.floor(Number(addQty) || 1));
    const price = variation ? effectiveVariationPrice(variation) : effectivePrice(product);
    const newLine: OrderLineItem = {
      product_id: product.id,
      product_name: product.name,
      variation_id: variation?.id ?? null,
      variation_name: variation?.name ?? null,
      quantity,
      price,
      total: lineTotal(price, quantity),
      purity_percentage: product.purity_percentage,
    };
    setDraft((prev) => [...prev, newLine]);
    setAddProductId('');
    setAddVariationId('');
    setAddQty('1');
  };

  const handleReset = () => setDraft(items);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {draft.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">No line items. Add a product below.</p>
        ) : (
          draft.map((item, index) => (
            <div
              key={`${item.product_id}-${item.variation_id ?? 'base'}-${index}`}
              className="bg-gray-50 rounded-lg p-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm font-semibold text-gray-900 truncate">
                  {item.product_name}
                  {item.variation_name ? ` — ${item.variation_name}` : ''}
                </p>
                <p className="text-[11px] text-gray-500">{peso(item.price)} each</p>
              </div>
              <input
                type="number"
                min={1}
                step={1}
                value={item.quantity}
                onChange={(e) => handleQtyChange(index, e.target.value)}
                disabled={busy}
                className="w-16 px-2 py-1 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
              <p className="w-24 text-right text-xs font-bold text-gray-900">{peso(item.total ?? 0)}</p>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                disabled={busy}
                title="Remove line"
                className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add a product */}
      <div className="flex flex-col sm:flex-row gap-2 bg-indigo-50/60 border border-indigo-100 rounded-lg p-3">
        <select
          value={addProductId}
          onChange={(e) => handleProductChange(e.target.value)}
          disabled={busy}
          className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        >
          <option value="">Add a product…</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} — {peso(effectivePrice(product))}
            </option>
          ))}
        </select>
        {hasVariations && (
          <select
            value={addVariationId}
            onChange={(e) => setAddVariationId(e.target.value)}
            disabled={busy}
            aria-label="Variation"
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          >
            <option value="">Select variation…</option>
            {selectedVariations.map((variation) => (
              <option
                key={variation.id}
                value={variation.id}
                disabled={variation.stock_quantity <= 0}
              >
                {variation.name} — {peso(effectiveVariationPrice(variation))}
                {variation.stock_quantity <= 0 ? ' (Out of stock)' : ''}
              </option>
            ))}
          </select>
        )}
        <input
          type="number"
          min={1}
          step={1}
          value={addQty}
          onChange={(e) => setAddQty(e.target.value)}
          disabled={busy}
          className="w-20 px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy || !addProductId || (hasVariations && !addVariationId)}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium flex items-center justify-center gap-1 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {/* Recomputed totals + save */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
        <div className="text-xs text-gray-600">
          <span className="font-semibold">Subtotal:</span>{' '}
          <span className="font-bold text-gray-900">{peso(subtotal)}</span>
          <span className="mx-2 text-gray-300">•</span>
          <span className="font-semibold">Total:</span>{' '}
          <span className="font-bold text-gray-900">{peso(subtotal)}</span>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={busy || !isDirty}
            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded text-xs font-medium flex items-center gap-1 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {busy ? 'Saving…' : 'Save items'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OrderItemsEditor;
