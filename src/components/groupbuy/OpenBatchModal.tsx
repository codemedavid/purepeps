import { useEffect, useId, useState } from 'react';
import { Boxes, Unlock, AlertTriangle, Layers, Check } from 'lucide-react';
import { useDialogA11y } from './useDialogA11y';
import { useTierLibrary } from '../../hooks/useTierLibrary';
import { formatPrice } from '../../utils/currency';

export interface OpenBatchValues {
  /** Trimmed batch name, or null when left blank. */
  name: string | null;
  /** Ids of the access tiers this batch offers (members pick one to unlock). */
  tierIds: string[];
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
  onSubmit: (values: OpenBatchValues) => void;
  onCancel: () => void;
}

/**
 * In-app form that replaces the window.prompt() pair used to open a group-buy
 * batch. Captures an optional name, the announced window, and WHICH access tiers
 * this batch offers — members pay one of the selected tiers to unlock checkout.
 * Tiers are the reusable global library; the selection is scoped to this batch.
 */
export function OpenBatchModal({
  open,
  busy = false,
  closesCurrent = false,
  onSubmit,
  onCancel,
}: OpenBatchModalProps) {
  const titleId = useId();
  const containerRef = useDialogA11y<HTMLDivElement>(open, onCancel);
  const { tiers, loading: tiersLoading } = useTierLibrary(open);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  // null = not yet seeded from the loaded library; once seeded it's the set of
  // selected tier ids. New batches default to offering every active tier.
  const [selectedTierIds, setSelectedTierIds] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset the form ONLY when the modal opens — never on an unrelated parent
  // re-render (which would wipe the admin's in-progress edits). Focus + Escape
  // + Tab-trapping are handled by useDialogA11y.
  useEffect(() => {
    if (!open) return;
    setName('');
    setStartsAt('');
    setEndsAt('');
    setSelectedTierIds(null);
    setError(null);
  }, [open]);

  // Seed the selection to "all tiers" once the library loads for this opening.
  useEffect(() => {
    if (!open || tiersLoading || selectedTierIds !== null) return;
    setSelectedTierIds(new Set(tiers.map((t) => t.id)));
  }, [open, tiersLoading, tiers, selectedTierIds]);

  if (!open) return null;

  const selected = selectedTierIds ?? new Set<string>();

  const toggleTier = (id: string) => {
    setSelectedTierIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setError(null);
  };

  const handleSubmit = () => {
    if (selected.size === 0) {
      setError('Choose at least one access tier members can buy.');
      return;
    }

    const start = startsAt.trim() ? startsAt.trim() : null;
    const end = endsAt.trim() ? endsAt.trim() : null;
    if (start && end && end <= start) {
      setError('Finish date must be after the start date.');
      return;
    }

    onSubmit({
      name: name.trim() ? name.trim() : null,
      tierIds: [...selected],
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
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
              <Layers className="h-3.5 w-3.5 text-brand-400" />
              Access tiers for this batch
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
              {tiersLoading ? (
                <p className="text-xs text-gray-500 px-1 py-0.5">Loading tiers…</p>
              ) : tiers.length === 0 ? (
                <p className="text-xs text-gray-500 px-1 py-0.5">
                  No active tiers yet. Add tiers in <strong>Access Tiers</strong> first so members
                  can pay to unlock checkout.
                </p>
              ) : (
                <ul className="space-y-1">
                  {tiers.map((tier) => {
                    const checked = selected.has(tier.id);
                    return (
                      <li key={tier.id}>
                        <button
                          type="button"
                          onClick={() => toggleTier(tier.id)}
                          disabled={busy}
                          aria-pressed={checked}
                          className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg border text-left text-sm transition-colors disabled:opacity-50 ${
                            checked
                              ? 'border-brand-300 bg-brand-50'
                              : 'border-gray-200 bg-white hover:border-brand-200'
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                                checked ? 'bg-brand-400 text-white' : 'bg-gray-100'
                              }`}
                            >
                              {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                            </span>
                            <span className="truncate text-gray-800">
                              {tier.name}
                              {tier.isAllAccess && (
                                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-sakura-deep">
                                  All access
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="font-mono font-semibold text-brand-500 whitespace-nowrap">
                            {formatPrice(tier.price)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              Members pick one selected tier to unlock checkout for this batch. Manage tier pricing
              and categories in <strong>Access Tiers</strong>.
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
