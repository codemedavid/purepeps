import { useEffect, useId, useState } from 'react';
import { Boxes, Unlock, AlertTriangle } from 'lucide-react';
import { useDialogA11y } from './useDialogA11y';

export interface OpenBatchValues {
  /** Trimmed batch name, or null when left blank. */
  name: string | null;
  /** Access fee in PHP (≥ 0), or null to fall back to the server default. */
  accessFee: number | null;
  /** Announced start date ('YYYY-MM-DD'), or null for an open-ended start. */
  startsAt: string | null;
  /** Announced finish date ('YYYY-MM-DD'), or null for no deadline. */
  endsAt: string | null;
}

interface OpenBatchModalProps {
  open: boolean;
  busy?: boolean;
  /** When true, opening this batch first CLOSES the current open batch. */
  closesCurrent?: boolean;
  defaultAccessFee?: number;
  onSubmit: (values: OpenBatchValues) => void;
  onCancel: () => void;
}

/**
 * In-app form that replaces the window.prompt() pair used to open a group-buy
 * batch. Captures an optional name and the per-batch access fee with inline
 * validation. A blank fee submits as null so the server default applies; a
 * negative fee is rejected before submit.
 */
export function OpenBatchModal({
  open,
  busy = false,
  closesCurrent = false,
  defaultAccessFee = 250,
  onSubmit,
  onCancel,
}: OpenBatchModalProps) {
  const titleId = useId();
  const containerRef = useDialogA11y<HTMLDivElement>(open, onCancel);
  const [name, setName] = useState('');
  const [fee, setFee] = useState(String(defaultAccessFee));
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset the form ONLY when the modal opens — never on an unrelated parent
  // re-render (which would wipe the admin's in-progress name/fee). Focus + Escape
  // + Tab-trapping are handled by useDialogA11y.
  useEffect(() => {
    if (!open) return;
    setName('');
    setFee(String(defaultAccessFee));
    setStartsAt('');
    setEndsAt('');
    setError(null);
  }, [open, defaultAccessFee]);

  if (!open) return null;

  const handleSubmit = () => {
    const trimmedFee = fee.trim();
    let accessFee: number | null = null;
    if (trimmedFee !== '') {
      const value = Number(trimmedFee);
      if (!Number.isFinite(value) || value < 0) {
        setError('Access fee must be 0 or more.');
        return;
      }
      accessFee = value;
    }

    const start = startsAt.trim() ? startsAt.trim() : null;
    const end = endsAt.trim() ? endsAt.trim() : null;
    if (start && end && end <= start) {
      setError('Finish date must be after the start date.');
      return;
    }

    onSubmit({
      name: name.trim() ? name.trim() : null,
      accessFee,
      startsAt: start,
      endsAt: end,
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
            <Boxes className="h-5 w-5" />
          </span>
          <h2 id={titleId} className="text-base font-bold text-gray-900">
            {closesCurrent ? 'Open a new batch' : 'Open a group buy batch'}
          </h2>
        </div>

        {closesCurrent && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              This will <strong>close the current batch</strong> and start a brand-new one. Orders
              already placed stay on the closed batch, and members must pay access again.
            </p>
          </div>
        )}

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <div>
            <label htmlFor={`${titleId}-name`} className="block text-xs font-semibold text-gray-700 mb-1">
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

          <div>
            <label htmlFor={`${titleId}-fee`} className="block text-xs font-semibold text-gray-700 mb-1">
              Access fee (₱)
            </label>
            <input
              id={`${titleId}-fee`}
              type="number"
              step="1"
              value={fee}
              onChange={(e) => {
                setFee(e.target.value);
                setError(null);
              }}
              placeholder="Server default"
              disabled={busy}
              aria-invalid={error != null}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 disabled:opacity-50 ${
                error ? 'border-red-300 focus:ring-red-300' : 'border-gray-300 focus:ring-brand-300'
              }`}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Members pay this once to unlock checkout for this batch. Leave blank to use the
              server default.
            </p>
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
              <Unlock className="h-4 w-4" />
              {busy ? 'Opening…' : 'Open batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default OpenBatchModal;
