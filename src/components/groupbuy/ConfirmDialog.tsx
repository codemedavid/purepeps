import { useId } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useDialogA11y } from './useDialogA11y';

export type ConfirmTone = 'default' | 'danger';

/** A request to confirm an action, raised by a child and resolved by the parent's dialog. */
export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
}

/** Callback threaded to children so any action can pop the shared confirm dialog. */
export type RequestConfirm = (request: ConfirmRequest) => void;

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRM_TONE: Record<ConfirmTone, string> = {
  default: 'bg-brand-400 hover:bg-brand-500 text-white',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
};

/**
 * Styled, accessible replacement for window.confirm used across the Group Buy
 * admin. Fully controlled: the parent owns `open` and the confirm/cancel
 * callbacks, so one instance can serve every destructive action. Escape and a
 * backdrop click both cancel; the confirm button takes initial focus.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const containerRef = useDialogA11y<HTMLDivElement>(open, onCancel);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-sakura-ink/40 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-white shadow-luxury border border-gray-100 p-5 animate-slideUp"
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-400'
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-gray-900">
              {title}
            </h2>
            {message && <p className="mt-1 text-sm text-gray-600">{message}</p>}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 ${CONFIRM_TONE[tone]}`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
