import {
  Unlock,
  RefreshCw,
  Lock,
  FlagTriangleRight,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import type { GroupBuyBatch, GroupBuyStatus } from '../../types';
import type { RequestConfirm } from './ConfirmDialog';
import { formatDateTime } from './orderStatusStyles';

interface BatchLifecycleBarProps {
  batch: GroupBuyBatch | null;
  busy: boolean;
  requestConfirm: RequestConfirm;
  onOpenBatch: () => void;
  onOpenNewBatch: () => void;
  onStartFinalizing: (batchId: string) => void;
  onFinalize: (batchId: string) => void;
  onReopen: (batchId: string) => void;
  onClose: (batchId: string) => void;
}

const STATUS_PILL: Readonly<
  Record<GroupBuyStatus, { label: string; className: string; pulse?: boolean }>
> = {
  open: { label: 'OPEN', className: 'bg-green-100 text-green-700', pulse: true },
  finalizing: { label: 'FINALIZING', className: 'bg-amber-100 text-amber-700', pulse: true },
  finalized: { label: 'FINALIZED', className: 'bg-blue-100 text-blue-700' },
  closed: { label: 'CLOSED', className: 'bg-gray-200 text-gray-600' },
};

/**
 * Status pill + the legal lifecycle transition buttons for the selected batch.
 * The DB RPCs enforce the state machine; this only surfaces the actions valid
 * from the current status. Destructive transitions confirm via window.confirm.
 */
export function BatchLifecycleBar({
  batch,
  busy,
  requestConfirm,
  onOpenBatch,
  onOpenNewBatch,
  onStartFinalizing,
  onFinalize,
  onReopen,
  onClose,
}: BatchLifecycleBarProps) {
  if (!batch) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5">
        <div className="text-center py-6">
          <p className="text-sm font-semibold text-gray-900 mb-1">No group buy is open</p>
          <p className="text-xs text-gray-500 mb-4">
            Checkout is disabled on the storefront until a batch is open.
          </p>
          <button
            type="button"
            onClick={onOpenBatch}
            disabled={busy}
            className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Unlock className="h-4 w-4" />
            Open a Batch
          </button>
        </div>
      </div>
    );
  }

  const pill = STATUS_PILL[batch.status];
  const status = batch.status;

  const handleStartFinalizing = () =>
    requestConfirm({
      title: 'Start finalizing this batch?',
      message:
        'This closes the storefront ordering window — no new customer orders can be placed. You can still confirm and edit existing orders.',
      confirmLabel: 'Start finalizing',
      onConfirm: () => onStartFinalizing(batch.id),
    });

  const handleFinalize = () =>
    requestConfirm({
      title: 'Finalize this batch?',
      message: 'Totals are locked and leftover claims close. Continue to delivery from here.',
      confirmLabel: 'Finalize',
      onConfirm: () => onFinalize(batch.id),
    });

  const handleReopen = () =>
    requestConfirm({
      title: 'Reopen this batch?',
      message:
        'The storefront ordering window reopens and customers can place new orders against this batch again.',
      confirmLabel: 'Reopen',
      onConfirm: () => onReopen(batch.id),
    });

  const handleClose = () =>
    requestConfirm({
      title: 'Close this batch?',
      message: 'It will be archived as complete. This cannot be undone.',
      confirmLabel: 'Close batch',
      tone: 'danger',
      onConfirm: () => onClose(batch.id),
    });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${pill.className}`}
            >
              {pill.pulse && (
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse opacity-70" />
              )}
              {pill.label}
            </span>
            <h2 className="text-lg font-bold text-gray-900">
              Batch #{batch.batch_number}
              {batch.name ? ` — ${batch.name}` : ''}
            </h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Opened {formatDateTime(batch.opened_at)}
            {batch.finalized_at ? ` • Finalized ${formatDateTime(batch.finalized_at)}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {status === 'open' && (
            <>
              <button
                type="button"
                onClick={handleStartFinalizing}
                disabled={busy}
                className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                <FlagTriangleRight className="h-3.5 w-3.5" />
                Start Finalizing
              </button>
              <button
                type="button"
                onClick={onOpenNewBatch}
                disabled={busy}
                className="bg-gray-900 hover:bg-gray-800 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Open New Batch
              </button>
            </>
          )}

          {status === 'finalizing' && (
            <>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={busy}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Finalize
              </button>
              <button
                type="button"
                onClick={handleReopen}
                disabled={busy}
                className="bg-white text-gray-700 border border-gray-300 hover:border-indigo-400 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reopen
              </button>
            </>
          )}

          {status === 'finalized' && (
            <button
              type="button"
              onClick={handleReopen}
              disabled={busy}
              className="bg-white text-gray-700 border border-gray-300 hover:border-indigo-400 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reopen
            </button>
          )}

          {status !== 'closed' && (
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              Close
            </button>
          )}

          {status === 'closed' && (
            <button
              type="button"
              onClick={onOpenBatch}
              disabled={busy}
              className="bg-gray-900 hover:bg-gray-800 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              <Unlock className="h-3.5 w-3.5" />
              Open a Batch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BatchLifecycleBar;
