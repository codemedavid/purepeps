import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import type { LigwakRecord } from '../../types';
import {
  LIGWAK_REFUND_STATUS_OPTIONS,
  type LigwakRefundStatus,
} from '../../constants/ligwak';
import { useImageUpload } from '../../hooks/useImageUpload';
import { peso } from '../groupbuy/orderStatusStyles';

export interface RecordRefundInput {
  recordId: string;
  amount: number;
  reference: string | null;
  proofUrl: string | null;
  notes: string | null;
}

export interface SetStatusInput {
  recordId: string;
  status: LigwakRefundStatus;
}

interface LigwakRefundModalProps {
  record: LigwakRecord;
  onClose: () => void;
  onRecordRefund: (input: RecordRefundInput) => Promise<void> | void;
  onSetStatus: (input: SetStatusInput) => Promise<void> | void;
}

/**
 * The refund workflow for one ligwak record: move it through the statuses, or
 * record that the money actually went back — with a reference number, proof and
 * internal notes.
 *
 * Two guards on the amount, because this is the screen where a slip costs real
 * money: it must be greater than zero, and it may not exceed what the system
 * calculated was owed. The calculated figure already accounts for the promo
 * discount and is capped at what the customer actually paid, so a larger number
 * is a typo far more often than a decision.
 */
export function LigwakRefundModal({
  record,
  onClose,
  onRecordRefund,
  onSetStatus,
}: LigwakRefundModalProps) {
  const { uploadImage, uploading } = useImageUpload('payment-proofs');
  const [amount, setAmount] = useState<string>(String(record.refund_amount ?? 0));
  const [reference, setReference] = useState(record.refund_reference ?? '');
  const [notes, setNotes] = useState(record.admin_notes ?? '');
  const [proofUrl, setProofUrl] = useState<string | null>(record.refund_proof_url);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const calculated = Number(record.refund_amount ?? 0);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      setProofUrl(await uploadImage(file));
      setError(null);
    } catch {
      setError('That proof could not be uploaded. Please try again.');
    }
  };

  const handleRecord = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('A recorded refund must be greater than zero.');
      return;
    }
    if (value > calculated) {
      setError(
        `That exceeds the ${peso(calculated)} calculated for this customer's ligwak vials.`,
      );
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onRecordRefund({
        recordId: record.id,
        amount: value,
        reference: reference.trim() || null,
        proofUrl,
        notes: notes.trim() || null,
      });
      onClose();
    } catch {
      setError('That refund could not be recorded. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ligwak-refund-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 p-4">
          <div>
            <h2 id="ligwak-refund-heading" className="text-base font-bold text-gray-900">
              Refund — {record.customer_name}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {record.order_number ?? '—'} · {record.product_name ?? '—'}
              {record.variation_name && ` ${record.variation_name}`} ·{' '}
              {record.ligwak_quantity} ligwak of {record.total_quantity}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-4 p-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="ligwak-refund-status"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Refund status
            </label>
            <select
              id="ligwak-refund-status"
              defaultValue={record.refund_status}
              onChange={(event) =>
                onSetStatus({
                  recordId: record.id,
                  status: event.target.value as LigwakRefundStatus,
                })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              {LIGWAK_REFUND_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ligwak-refund-amount"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Refunded amount
            </label>
            <input
              id="ligwak-refund-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <p className="mt-1 text-xs text-gray-500">
              Calculated for the ligwak vials: {peso(calculated)}
            </p>
          </div>

          <div>
            <label
              htmlFor="ligwak-refund-reference"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Refund reference number
            </label>
            <input
              id="ligwak-refund-reference"
              type="text"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="e.g. GCash reference"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>

          <div>
            <label
              htmlFor="ligwak-refund-proof"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Proof of refund
            </label>
            <input
              id="ligwak-refund-proof"
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) => handleUpload(event.target.files?.[0])}
              className="mt-1 w-full text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700"
            />
            {proofUrl && (
              <a
                href={proofUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
              >
                <Upload className="h-3 w-3" aria-hidden="true" />
                View uploaded proof
              </a>
            )}
          </div>

          <div>
            <label
              htmlFor="ligwak-refund-notes"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Internal notes
            </label>
            <textarea
              id="ligwak-refund-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-gray-100 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRecord}
            disabled={saving || uploading}
            className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            Mark as refunded
          </button>
        </footer>
      </div>
    </div>
  );
}

export default LigwakRefundModal;
