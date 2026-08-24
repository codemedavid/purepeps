import { csvRow, money, type Cell } from './csv';
import { paymentStatusLabel, paymentTypeLabel } from '../constants/payment';
import { ligwakRefundStatusLabel } from '../constants/ligwak';

/**
 * Pure CSV builder for the Ligwak Management list, so an admin can hand the
 * refund run to accounting or work it in a spreadsheet. Shares the RFC-4180
 * cell/row/money primitives with the other group-buy exports via ./csv.
 *
 * Emits human LABELS rather than stored tokens ("Pay Now", not "pay_now"):
 * this file is read by people, and the reader deciding who to pay back should
 * not have to know the schema.
 */

export interface LigwakExportRow {
  readonly customer_name: string;
  readonly customer_email: string;
  readonly customer_phone: string | null;
  readonly order_number: string | null;
  /** Group buy name or number, however the admin labelled the batch. */
  readonly batch_label: string | null;
  readonly product_name: string | null;
  readonly variation_name: string | null;
  readonly quantity_mg: number | null;
  readonly total_quantity: number;
  readonly confirmed_quantity: number;
  readonly ligwak_quantity: number;
  readonly refund_amount: number;
  readonly payment_type: string | null;
  readonly payment_status: string | null;
  readonly refund_status: string | null;
  readonly ordered_at: string;
  readonly reason: string | null;
  readonly refund_reference: string | null;
  readonly admin_notes: string | null;
}

const HEADER = [
  'Customer',
  'Email',
  'Phone',
  'Order #',
  'Group Buy',
  'Product',
  'Variation',
  'Dosage (mg)',
  'Total qty',
  'Confirmed qty',
  'Ligwak qty',
  'Refund amount',
  'Payment method',
  'Payment status',
  'Refund status',
  'Order date',
  'Reason',
  'Refund reference',
  'Admin notes',
];

function exportRow(row: LigwakExportRow): Cell[] {
  return [
    row.customer_name,
    row.customer_email,
    row.customer_phone ?? '',
    row.order_number ?? '',
    row.batch_label ?? '',
    row.product_name ?? '',
    row.variation_name ?? '',
    row.quantity_mg ?? '',
    row.total_quantity,
    row.confirmed_quantity,
    row.ligwak_quantity,
    money(row.refund_amount),
    paymentTypeLabel(row.payment_type),
    // Read in the context of how they paid, so a pending COD order reads
    // "Collect on Delivery" rather than implying money is being chased.
    paymentStatusLabel(row.payment_status, row.payment_type),
    ligwakRefundStatusLabel(row.refund_status),
    row.ordered_at,
    row.reason ?? '',
    row.refund_reference ?? '',
    row.admin_notes ?? '',
  ];
}

/**
 * The ligwak list as CSV, with a trailing totals row.
 *
 * The totals line carries the two numbers the run is judged on — vials affected
 * and money owed — so nobody has to re-add a column by hand. A list with no rows
 * still emits its header, so an empty export reads as "nothing owed" rather than
 * as a broken download.
 */
export function buildLigwakCsv(rows: readonly LigwakExportRow[]): string {
  if (rows.length === 0) return csvRow(HEADER);

  const totalLigwak = rows.reduce((sum, row) => sum + row.ligwak_quantity, 0);
  const totalRefund = rows.reduce((sum, row) => sum + row.refund_amount, 0);

  return [
    csvRow(HEADER),
    ...rows.map((row) => csvRow(exportRow(row))),
    csvRow([
      'TOTAL',
      '', '', '', '', '', '', '', '', '',
      totalLigwak,
      money(totalRefund),
      '', '', '', '', '', '', '',
    ]),
  ].join('\n');
}
