/**
 * Vocabulary for the Ligwak refund workflow. Side-effect free, mirroring the
 * shape of ./payment.ts so the two read the same way in the admin dashboard.
 *
 * "Ligwak" is a vial left behind in an incomplete kit when a group buy closes.
 * These statuses track only the money owed for those vials — they are separate
 * from orders.payment_status, which describes the order as a whole. An order can
 * be Paid and still have a Refund Pending ligwak record against three of its
 * vials.
 */

export const LIGWAK_REFUND_STATUSES = [
  'for_review',
  'refund_pending',
  'refund_processing',
  'refunded',
  'refund_failed',
  'no_refund_required',
] as const;

export type LigwakRefundStatus = (typeof LIGWAK_REFUND_STATUSES)[number];

const LIGWAK_REFUND_STATUS_LABELS: Readonly<Record<string, string>> = {
  for_review: 'For Review',
  refund_pending: 'Refund Pending',
  refund_processing: 'Refund Processing',
  refunded: 'Refunded',
  refund_failed: 'Refund Failed',
  no_refund_required: 'No Refund Required',
};

const LIGWAK_REFUND_STATUS_COLORS: Readonly<Record<string, string>> = {
  for_review: 'bg-gold-100 text-gold-700 border-gold-300',
  refund_pending: 'bg-amber-100 text-amber-800 border-amber-300',
  refund_processing: 'bg-blue-100 text-blue-800 border-blue-300',
  refunded: 'bg-green-100 text-green-700 border-green-300',
  refund_failed: 'bg-red-100 text-red-700 border-red-300',
  no_refund_required: 'bg-slate-100 text-slate-700 border-slate-300',
};

const NEUTRAL_STATUS_COLOR = 'bg-gray-100 text-gray-700 border-gray-300';

/** Every status an admin may set by hand, in workflow order. */
export const LIGWAK_REFUND_STATUS_OPTIONS: readonly {
  value: LigwakRefundStatus;
  label: string;
}[] = LIGWAK_REFUND_STATUSES.map((value) => ({
  value,
  label: LIGWAK_REFUND_STATUS_LABELS[value],
}));

export function ligwakRefundStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return LIGWAK_REFUND_STATUS_LABELS[status] ?? status;
}

export function ligwakRefundStatusColor(status: string | null | undefined): string {
  if (!status) return NEUTRAL_STATUS_COLOR;
  return LIGWAK_REFUND_STATUS_COLORS[status] ?? NEUTRAL_STATUS_COLOR;
}

/**
 * Whether this ligwak record needs nothing further from the admin.
 *
 * `refund_failed` is deliberately NOT settled: a failed transfer means the money
 * is still owed, and letting it drop out of the outstanding list is how a
 * customer ends up never being paid back.
 */
export function isLigwakRefundSettled(status: string | null | undefined): boolean {
  return status === 'refunded' || status === 'no_refund_required';
}
