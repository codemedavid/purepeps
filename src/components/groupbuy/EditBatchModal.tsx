import { useEffect, useId, useState } from 'react';
import { Settings, Save, AlertTriangle } from 'lucide-react';
import type { GroupBuyBatch } from '../../types';
import { useDialogA11y } from './useDialogA11y';

/** A tier the admin can offer on a batch (active tiers from the global library). */
export interface BatchTierOption {
  id: string;
  name: string;
  price: number;
}

export interface EditBatchValues {
  /** Trimmed batch name, or null when left blank. */
  name: string | null;
  /** Announced start date ('YYYY-MM-DD'), or null for an open-ended start. */
  startsAt: string | null;
  /** Announced finish date ('YYYY-MM-DD'), or null for no deadline. */
  endsAt: string | null;
  /** The tier ids offered on this batch, in the order they appear in `tiers`. */
  tierIds: string[];
}

interface EditBatchModalProps {
  open: boolean;
  busy?: boolean;
  batch: GroupBuyBatch;
  /** Active tiers the admin may offer, already ordered for display. */
  tiers: BatchTierOption[];
  /** Tier ids currently offered on the batch. */
  selectedTierIds: string[];
  onSubmit: (values: EditBatchValues) => void;
  onCancel: () => void;
}

const PESO = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

// Dates are stored as timestamptz but only ever written as date-only values, so
// the first 10 chars are the 'YYYY-MM-DD' the date input expects. Blank when unset.
function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

/**
 * Edit an OPEN batch's settings in one place: its name, the announced window
 * (start / finish dates), and which access tiers it offers. Mirrors
 * OpenBatchModal but seeds every field from the existing batch and only writes
 * changes through set_group_buy_schedule / set_batch_tiers (no reopen, so members
 * keep their access).
 */
export function EditBatchModal({
  open,
  busy = false,
  batch,
  tiers,
  selectedTierIds,
  onSubmit,
  onCancel,
}: EditBatchModalProps) {
  const titleId = useId();
  const containerRef = useDialogA11y<HTMLDivElement>(open, onCancel);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Seed the form ONLY when the modal opens — never on an unrelated parent
  // re-render (which would wipe the admin's in-progress edits).
  useEffect(() => {
    if (!open) return;
    setName(batch.name ?? '');
    setStartsAt(toDateInput(batch.starts_at));
    setEndsAt(toDateInput(batch.ends_at));
    setChecked(Object.fromEntries(selectedTierIds.map((id) => [id, true])));
    setError(null);
  }, [open, batch.name, batch.starts_at, batch.ends_at, selectedTierIds]);

  if (!open) return null;

  const toggleTier = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = () => {
    const start = startsAt.trim() ? startsAt.trim() : null;
    const end = endsAt.trim() ? endsAt.trim() : null;
    if (start && end && end <= start) {
      setError('Finish date must be after the start date.');
      return;
    }

    onSubmit({
      name: name.trim() ? name.trim() : null,
      startsAt: start,
      endsAt: end,
      tierIds: tiers.filter((tier) => checked[tier.id]).map((tier) => tier.id),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-sakura-ink/40 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-white shadow-luxury border border-gray-100 p-5 animate-slideUp"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-400">
            <Settings className="h-5 w-5" />
          </span>
          <h2 id={titleId} className="text-base font-bold text-gray-900">
            Edit batch #{batch.batch_number} settings
          </h2>
        </div>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <div>
            <label
              htmlFor={`${titleId}-name`}
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Batch name <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id={`${titleId}-name`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. June Drop"
              disabled={busy}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`${titleId}-starts`}
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                Start date <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id={`${titleId}-starts`}
                type="date"
                value={startsAt}
                onChange={(e) => {
                  setStartsAt(e.target.value);
                  setError(null);
                }}
                disabled={busy}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-50"
              />
            </div>
            <div>
              <label
                htmlFor={`${titleId}-ends`}
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                Finish date <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id={`${titleId}-ends`}
                type="date"
                value={endsAt}
                onChange={(e) => {
                  setEndsAt(e.target.value);
                  setError(null);
                }}
                disabled={busy}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-50"
              />
            </div>
            <p className="col-span-2 -mt-1 text-[11px] text-gray-500">
              Shown to members in the storefront hero as the group-buy window and live countdown.
            </p>
          </div>

          <fieldset>
            <legend className="block text-xs font-semibold text-gray-700 mb-1">
              Access tiers offered on this batch
            </legend>
            {tiers.length === 0 ? (
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                No active tiers yet. Create tiers in <strong>Access Tiers</strong> first.
              </p>
            ) : (
              <div className="space-y-1.5 rounded-lg border border-gray-200 p-2">
                {tiers.map((tier) => (
                  <label
                    key={tier.id}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(checked[tier.id])}
                        onChange={() => toggleTier(tier.id)}
                        disabled={busy}
                        className="h-4 w-4 rounded border-gray-300 text-brand-400 focus:ring-brand-300"
                      />
                      <span className="text-sm text-gray-900">{tier.name}</span>
                    </span>
                    <span className="text-xs font-medium text-gray-500">{PESO.format(tier.price)}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Un-ticking a tier hides it from checkout for members who have not paid yet.
            </p>
          </fieldset>

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-400 hover:bg-brand-500 text-white inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditBatchModal;
