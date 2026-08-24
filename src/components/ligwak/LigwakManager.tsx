import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, BellRing, Download, PackageX } from 'lucide-react';
import type { LigwakRecord } from '../../types';
import {
  LIGWAK_REFUND_STATUS_OPTIONS,
  isLigwakRefundSettled,
} from '../../constants/ligwak';
import { useLigwak } from '../../hooks/useLigwak';
import { buildLigwakCsv, type LigwakExportRow } from '../../utils/ligwakExport';
import { downloadCsv } from '../../utils/downloadCsv';
import { getActionErrorMessage } from '../../utils/errorMessage';
import { peso } from '../groupbuy/orderStatusStyles';
import LigwakTable from './LigwakTable';
import LigwakRefundModal from './LigwakRefundModal';

interface LigwakManagerProps {
  onBack: () => void;
  /** Limit to one group buy; omit to manage every batch's ligwak at once. */
  batchId?: string | null;
}

const ALL = 'all';

function toExportRow(record: LigwakRecord): LigwakExportRow {
  return {
    customer_name: record.customer_name,
    customer_email: record.customer_email,
    customer_phone: record.customer_phone,
    order_number: record.order_number,
    batch_label: record.batch_label ?? null,
    product_name: record.product_name,
    variation_name: record.variation_name,
    quantity_mg: record.quantity_mg,
    total_quantity: record.total_quantity,
    confirmed_quantity: record.confirmed_quantity,
    ligwak_quantity: record.ligwak_quantity,
    refund_amount: record.refund_amount,
    payment_type: record.payment_type,
    payment_status: record.payment_status,
    refund_status: record.refund_status,
    ordered_at: record.ordered_at,
    reason: record.reason,
    refund_reference: record.refund_reference,
    admin_notes: record.admin_notes,
  };
}

function matchesSearch(record: LigwakRecord, term: string): boolean {
  const haystack = [
    record.customer_name,
    record.customer_email,
    record.customer_phone,
    record.order_number,
    record.product_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(term.toLowerCase());
}

/**
 * Ligwak Management: every customer left holding vials from an incomplete kit,
 * and the refunds owed to them.
 *
 * The headline number is what is still OUTSTANDING rather than the gross total.
 * Once refunds start going out, the gross stops being actionable, while the
 * outstanding figure is the one that has to reach zero before the group buy is
 * genuinely closed.
 */
export function LigwakManager({ onBack, batchId }: LigwakManagerProps) {
  const { records, loading, error, recordRefund, setRefundStatus, notifyCustomers } =
    useLigwak(batchId);

  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<LigwakRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      records.filter(
        (record) =>
          (statusFilter === ALL || record.refund_status === statusFilter) &&
          (search.trim() === '' || matchesSearch(record, search.trim())),
      ),
    [records, statusFilter, search],
  );

  const outstanding = useMemo(
    () =>
      records
        .filter((record) => !isLigwakRefundSettled(record.refund_status))
        .reduce((sum, record) => sum + Number(record.refund_amount ?? 0), 0),
    [records],
  );

  const unnotified = useMemo(
    () => visible.filter((record) => !record.customer_notified_at).map((record) => record.id),
    [visible],
  );

  const guard = async (action: () => Promise<void>) => {
    try {
      setActionError(null);
      await action();
    } catch (err) {
      setActionError(getActionErrorMessage(err, 'That action could not be completed.'));
    }
  };

  const handleExport = () => {
    // Exports what is ON SCREEN. An admin who filtered to "Refund Pending" and
    // hit Export must not hand accounting every record in the batch.
    downloadCsv(`ligwak-${batchId ?? 'all'}.csv`, buildLigwakCsv(visible.map(toExportRow)));
  };

  const handleNotify = () => {
    if (unnotified.length === 0) return;
    if (
      !window.confirm(
        `Mark ${unnotified.length} customer${unnotified.length === 1 ? '' : 's'} as notified?`,
      )
    ) {
      return;
    }
    void guard(() => notifyCustomers(unnotified));
  };

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <PackageX className="h-5 w-5 text-amber-600" aria-hidden="true" />
              Ligwak Management
            </h1>
            <p className="text-xs text-gray-500">
              Customers whose vials fell outside a complete kit, and what is owed to them.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleNotify}
            disabled={unnotified.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <BellRing className="h-4 w-4" aria-hidden="true" />
            Notify customers
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </header>

      {(error || actionError) && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error ?? actionError}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Affected records
          </dt>
          <dd className="mt-0.5 text-xl font-bold text-gray-900">{records.length}</dd>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Ligwak vials
          </dt>
          <dd className="mt-0.5 text-xl font-bold text-amber-800">
            {records.reduce((sum, record) => sum + record.ligwak_quantity, 0)}
          </dd>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Outstanding refunds
          </dt>
          <dd data-testid="outstanding-refunds" className="mt-0.5 text-xl font-bold text-gray-900">
            {peso(outstanding)}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label
            htmlFor="ligwak-search"
            className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
          >
            Search
          </label>
          <input
            id="ligwak-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Customer, email, phone or order number"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
        <div>
          <label
            htmlFor="ligwak-status-filter"
            className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
          >
            Filter by refund status
          </label>
          <select
            id="ligwak-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            <option value={ALL}>All statuses</option>
            {LIGWAK_REFUND_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="p-8 text-center text-sm text-gray-500">Loading Ligwak records…</p>
      ) : (
        <LigwakTable records={visible} onOpenRefund={setActive} />
      )}

      {active && (
        <LigwakRefundModal
          record={active}
          onClose={() => setActive(null)}
          onRecordRefund={(input) => guard(() => recordRefund(input))}
          onSetStatus={(input) => guard(() => setRefundStatus(input))}
        />
      )}
    </div>
  );
}

export default LigwakManager;
