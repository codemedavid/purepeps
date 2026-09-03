import { useEffect, useState } from 'react';
import {
  MINIMUM_ORDER_UNITS,
  minimumOrderNotice,
  resolveMinimumOrder,
  type MinimumOrderUnit,
  type UniversalMinimumOrder,
} from '../utils/minimumOrder';
import type { Product } from '../types';

/** The six product columns that decide a minimum. */
export interface ProductMinimumOrderValue {
  minimum_order_enabled: boolean;
  use_universal_minimum: boolean;
  minimum_order_quantity: number;
  minimum_order_unit: string | null;
  minimum_order_message: string | null;
  enforce_minimum_per_variation: boolean;
}

interface ProductMinimumOrderFieldsProps {
  value: ProductMinimumOrderValue;
  /** The site-wide setting, so the panel can show what "universal" resolves to. */
  universal: UniversalMinimumOrder;
  onChange: (next: ProductMinimumOrderValue) => void;
}

const LABEL_CLASS = 'block text-[11px] font-semibold text-gray-600';
const FIELD_CLASS =
  'mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-sakura-primary ' +
  'focus:outline-none focus:ring-1 focus:ring-sakura-primary';

function Toggle({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-sakura-primary' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/**
 * The per-product half of the minimum-order feature, for the product form.
 *
 * Every control is hidden once `minimum_order_enabled` is off, and the custom
 * quantity is hidden while the product follows the universal setting. Leaving
 * a live-looking quantity beside a rule that ignores it is how an admin comes
 * to believe they set a minimum that was never applied.
 *
 * Turning things off never clears the stored numbers, so switching back
 * restores what was there — the client asked to be able to disable a feature
 * without losing its data.
 */
export default function ProductMinimumOrderFields({
  value,
  universal,
  onChange,
}: ProductMinimumOrderFieldsProps) {
  const patch = (changes: Partial<ProductMinimumOrderValue>) =>
    onChange({ ...value, ...changes });

  // The quantity input keeps its own text while being edited. Clamping to >= 1
  // on every keystroke makes the field impossible to retype: clearing it snaps
  // it back to "1", so typing "8" produces "18". The clamped NUMBER still goes
  // up to the parent on every change, so what is stored is always valid.
  const [quantityDraft, setQuantityDraft] = useState(String(value.minimum_order_quantity));

  useEffect(() => {
    setQuantityDraft(String(value.minimum_order_quantity));
    // Only re-seed when the product being edited changes underneath us, not on
    // every keystroke this component itself caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.use_universal_minimum, value.minimum_order_enabled]);

  // Resolved through the same function the storefront uses, so this preview
  // cannot drift from what a customer is actually told.
  const previewProduct = {
    minimum_order_enabled: value.minimum_order_enabled,
    use_universal_minimum: value.use_universal_minimum,
    minimum_order_quantity: value.minimum_order_quantity,
    minimum_order_unit: value.minimum_order_unit,
    minimum_order_message: value.minimum_order_message,
    enforce_minimum_per_variation: value.enforce_minimum_per_variation,
  } as Product;

  const notice = minimumOrderNotice(resolveMinimumOrder(previewProduct, universal));

  return (
    <fieldset className="rounded-lg border border-gray-200 p-3">
      <legend className="px-1 text-xs font-bold text-gray-700">Minimum order</legend>

      <div className="flex items-center gap-2">
        <Toggle
          checked={value.minimum_order_enabled}
          label="Require a minimum order for this product"
          onToggle={() => patch({ minimum_order_enabled: !value.minimum_order_enabled })}
        />
        <span className="text-xs font-semibold text-gray-700">
          {value.minimum_order_enabled
            ? 'Minimum order required'
            : 'No minimum for this product'}
        </span>
      </div>

      {value.minimum_order_enabled && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <Toggle
              checked={value.use_universal_minimum}
              label="Use universal minimum"
              onToggle={() => patch({ use_universal_minimum: !value.use_universal_minimum })}
            />
            <span className="text-xs text-gray-700">
              Use universal minimum
              {value.use_universal_minimum && (
                <span className="ml-1 text-gray-500">
                  {universal.enabled
                    ? `— currently ${universal.quantity} ${universal.unit}${
                        universal.quantity === 1 ? '' : universal.unit === 'box' ? 'es' : 's'
                      }`
                    : '— currently switched off site-wide'}
                </span>
              )}
            </span>
          </div>

          {!value.use_universal_minimum && (
            <div className="flex flex-wrap gap-3">
              <div>
                <label htmlFor="product-minimum-quantity" className={LABEL_CLASS}>
                  Custom minimum quantity
                </label>
                <input
                  id="product-minimum-quantity"
                  type="number"
                  min={1}
                  step={1}
                  value={quantityDraft}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setQuantityDraft(raw);
                    patch({ minimum_order_quantity: Math.max(1, Number(raw) || 1) });
                  }}
                  onBlur={() => setQuantityDraft(String(value.minimum_order_quantity))}
                  className={`${FIELD_CLASS} w-28`}
                />
              </div>
              <div>
                <label htmlFor="product-minimum-unit" className={LABEL_CLASS}>
                  Unit
                </label>
                <select
                  id="product-minimum-unit"
                  value={value.minimum_order_unit ?? universal.unit}
                  onChange={(event) =>
                    patch({ minimum_order_unit: event.target.value as MinimumOrderUnit })
                  }
                  className={FIELD_CLASS}
                >
                  {MINIMUM_ORDER_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2">
            <Toggle
              checked={value.enforce_minimum_per_variation}
              label="Require the minimum for each variation separately"
              onToggle={() =>
                patch({ enforce_minimum_per_variation: !value.enforce_minimum_per_variation })
              }
            />
            <span className="text-xs text-gray-700">
              Require it for each variation separately
              <span className="mt-0.5 block text-[11px] text-gray-500">
                {value.enforce_minimum_per_variation
                  ? 'Every strength must reach the minimum on its own.'
                  : 'Off: quantities of all variations are combined to meet the minimum.'}
              </span>
            </span>
          </div>

          <div>
            <label htmlFor="product-minimum-message" className={LABEL_CLASS}>
              Customer message (optional)
            </label>
            <input
              id="product-minimum-message"
              type="text"
              value={value.minimum_order_message ?? ''}
              onChange={(event) => patch({ minimum_order_message: event.target.value || null })}
              placeholder={notice ?? 'Minimum order: 5 vials for this product.'}
              className={`${FIELD_CLASS} w-full`}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Leave blank to use the generated notice shown as the placeholder.
            </p>
          </div>
        </div>
      )}
    </fieldset>
  );
}
