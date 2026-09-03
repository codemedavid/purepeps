import { useEffect, useState } from 'react';
import { Ruler } from 'lucide-react';
import { useUniversalMinimum } from '../hooks/useUniversalMinimum';
import { getActionErrorMessage } from '../utils/errorMessage';
import { MINIMUM_ORDER_UNITS, type MinimumOrderUnit } from '../utils/minimumOrder';

/**
 * Admin → Products, pinned above the catalogue.
 *
 * One control that reaches every product, so the panel says so in words rather
 * than leaving an admin to infer it, and says which products will ignore it.
 * Without that second sentence, an admin who set a per-product override last
 * week changes this, sees nothing happen to that product, and concludes the
 * panel is broken.
 */
export default function UniversalMinimumOrderPanel() {
  const { universal, loading, save } = useUniversalMinimum();

  const [enabled, setEnabled] = useState(universal.enabled);
  const [quantity, setQuantity] = useState(String(universal.quantity));
  const [unit, setUnit] = useState<MinimumOrderUnit>(universal.unit);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Adopt the stored setting once it arrives, so the form never shows a blank
  // or stale rule while the read is still in flight.
  useEffect(() => {
    setEnabled(universal.enabled);
    setQuantity(String(universal.quantity));
    setUnit(universal.unit);
  }, [universal]);

  const handleSave = async () => {
    setError(null);
    setSaved(false);

    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed < 1) {
      // resolveMinimumOrder treats anything below 1 as NO minimum, so storing
      // it would look like setting a rule and behave like clearing one.
      setError('Enter a whole minimum quantity of 1 or more.');
      return;
    }

    setSaving(true);
    try {
      await save({ enabled, quantity: parsed, unit });
      setSaved(true);
    } catch (err) {
      setError(getActionErrorMessage(err, 'That setting could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sakura-blush">
          <Ruler className="h-4 w-4 text-sakura-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-gray-900">Universal minimum order</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Applies to every product that follows the universal setting. Products with their own
            minimum, or with minimums switched off, ignore this.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label="Require a universal minimum order"
                onClick={() => setEnabled((current) => !current)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  enabled ? 'bg-sakura-primary' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-xs font-semibold text-gray-700">
                {enabled ? 'Required' : 'Not required'}
              </span>
            </div>

            <div>
              <label
                htmlFor="universal-minimum-quantity"
                className="block text-[11px] font-semibold text-gray-600"
              >
                Minimum quantity
              </label>
              <input
                id="universal-minimum-quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="mt-1 w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-sakura-primary focus:outline-none focus:ring-1 focus:ring-sakura-primary"
              />
            </div>

            <div>
              <label
                htmlFor="universal-minimum-unit"
                className="block text-[11px] font-semibold text-gray-600"
              >
                Unit
              </label>
              <select
                id="universal-minimum-unit"
                value={unit}
                onChange={(event) => setUnit(event.target.value as MinimumOrderUnit)}
                className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-sakura-primary focus:outline-none focus:ring-1 focus:ring-sakura-primary"
              >
                {MINIMUM_ORDER_UNITS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loading}
              className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-xs font-medium text-red-600">
              {error}
            </p>
          )}
          {saved && !error && (
            <p role="status" className="mt-3 text-xs font-medium text-emerald-700">
              Saved.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
