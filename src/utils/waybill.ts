// Builds the normalized, print-ready data for a customer waybill / order summary
// (J&T-style). Pure functions only — no React, no I/O — so the mapping and the
// money math stay unit-testable independent of any component.
//
// It accepts the two order shapes the admin surfaces already carry — the regular
// `Order` in OrdersManager and the group-buy `BatchOrder` — via a loose
// structural input. Only fields that actually exist are rendered; everything
// missing collapses to `null`, which the UI shows as "N/A".

export const WAYBILL_STORE_NAME = 'PURE PEPS';
export const WAYBILL_TITLE = 'PURE PEPS — WAYBILL / ORDER SUMMARY';

// A waybill prints for a customer's CONFIRMED order and every fulfillment stage
// after it. 'new' (not yet confirmed) and 'cancelled' are excluded — there is no
// confirmed order to ship. Legacy 'processing'/'shipped' map onto the same set.
const WAYBILL_ELIGIBLE_STATUSES: ReadonlySet<string> = new Set([
  'confirmed',
  'packing',
  'processing',
  'out_for_delivery',
  'shipped',
  'delivered',
]);

export function canPrintWaybill(status: string | null | undefined): boolean {
  return status != null && WAYBILL_ELIGIBLE_STATUSES.has(status);
}

// The subset of order fields the waybill reads. Both `Order` (OrdersManager) and
// `BatchOrder` (types/index.ts) satisfy this structurally — they carry more.
export interface WaybillOrderInput {
  id: string;
  order_number?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  contact_method?: string | null;
  selected_sticker_name?: string | null;
  shipping_address?: string | null;
  shipping_barangay?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip_code?: string | null;
  shipping_country?: string | null;
  shipping_location?: string | null;
  shipping_fee?: number | null;
  shipping_provider?: string | null;
  shipping_note?: string | null;
  tracking_number?: string | null;
  order_items?:
    | {
        product_name?: string | null;
        variation_name?: string | null;
        price?: number | null;
        quantity?: number | null;
        total?: number | null;
      }[]
    | null;
  subtotal?: number | null;
  total_price?: number | null;
  payment_method_name?: string | null;
  payment_proof_url?: string | null;
  additional_payment_proof_url?: string | null;
  payment_status?: string | null;
  order_status?: string | null;
  is_claim?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WaybillOptions {
  /** Store / brand title. Defaults to PURE PEPS. */
  storeName?: string;
  /** Per-batch admin/access fee (PHP). Group-buy orders pass the batch's access_fee. */
  adminFee?: number | null;
  /** e.g. "Batch #3 · Recovery drop". Shown when the order belongs to a group buy. */
  batchLabel?: string | null;
}

export interface WaybillLineItem {
  name: string;
  price: number;
  quantity: number;
  total: number;
}

export interface WaybillData {
  storeName: string;
  title: string;
  orderNumber: string;
  orderId: string;
  dateLabel: string;
  batchLabel: string | null;
  isClaim: boolean;
  customer: {
    name: string;
    contact: string | null;
    email: string | null;
    contactMethod: string | null;
    stickerName: string | null;
  };
  address: {
    municipality: string | null;
    province: string | null;
    barangay: string | null;
    street: string | null;
    postalCode: string | null;
    country: string | null;
    region: string | null;
    hasAny: boolean;
  };
  shipping: {
    courier: string | null;
    method: string | null;
    fee: number;
    trackingNumber: string | null;
  };
  adminFee: number | null;
  receiptUrl: string | null;
  additionalReceiptUrl: string | null;
  paymentMethod: string | null;
  paymentStatusLabel: string;
  isPaymentConfirmed: boolean;
  items: WaybillLineItem[];
  itemsSubtotal: number;
  grandTotal: number;
  qrValue: string;
}

const PAYMENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  paid: 'Paid',
  submitted: 'Under review',
  pending: 'Pending',
  failed: 'Failed',
};

function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function toNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatWaybillDate(iso: string | null | undefined): string {
  const value = cleanText(iso);
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function lineItemName(item: {
  product_name?: string | null;
  variation_name?: string | null;
}): string {
  const product = cleanText(item.product_name) ?? 'Item';
  const variation = cleanText(item.variation_name);
  return variation ? `${product} — ${variation}` : product;
}

// Map a raw order into the normalized waybill shape. Item totals fall back to
// price × quantity when a stored `total` is missing so the math is never blank.
export function buildWaybillData(
  order: WaybillOrderInput,
  options: WaybillOptions = {},
): WaybillData {
  const items: WaybillLineItem[] = (order.order_items ?? []).map((item) => {
    const price = toNumber(item.price);
    const quantity = toNumber(item.quantity);
    const total = item.total != null ? toNumber(item.total) : price * quantity;
    return { name: lineItemName(item), price, quantity, total };
  });

  const itemsSubtotal = items.reduce((sum, item) => sum + item.total, 0);
  const shippingFee = toNumber(order.shipping_fee);
  const adminFee = options.adminFee != null ? toNumber(options.adminFee) : null;
  const grandTotal = itemsSubtotal + shippingFee + (adminFee ?? 0);

  const municipality = cleanText(order.shipping_city);
  const province = cleanText(order.shipping_state);
  const barangay = cleanText(order.shipping_barangay);
  const street = cleanText(order.shipping_address);
  const postalCode = cleanText(order.shipping_zip_code);
  const country = cleanText(order.shipping_country);
  const region = cleanText(order.shipping_location);

  const paymentStatus = cleanText(order.payment_status) ?? 'pending';
  const orderNumber = cleanText(order.order_number) ?? order.id.slice(0, 8).toUpperCase();

  const qrValue = [
    `${WAYBILL_STORE_NAME} Order`,
    `No: ${orderNumber}`,
    `ID: ${order.id}`,
    `Total: PHP ${grandTotal.toFixed(2)}`,
  ].join('\n');

  return {
    storeName: cleanText(options.storeName) ?? WAYBILL_STORE_NAME,
    title: WAYBILL_TITLE,
    orderNumber,
    orderId: order.id,
    dateLabel: formatWaybillDate(order.created_at),
    batchLabel: cleanText(options.batchLabel),
    isClaim: order.is_claim === true,
    customer: {
      name: cleanText(order.customer_name) ?? 'N/A',
      contact: cleanText(order.customer_phone),
      email: cleanText(order.customer_email),
      contactMethod: cleanText(order.contact_method),
      stickerName: cleanText(order.selected_sticker_name),
    },
    address: {
      municipality,
      province,
      barangay,
      street,
      postalCode,
      country,
      region,
      hasAny: Boolean(
        municipality || province || barangay || street || postalCode || country || region,
      ),
    },
    shipping: {
      courier: cleanText(order.shipping_provider),
      method: cleanText(order.shipping_note),
      fee: shippingFee,
      trackingNumber: cleanText(order.tracking_number),
    },
    adminFee,
    receiptUrl: cleanText(order.payment_proof_url),
    additionalReceiptUrl: cleanText(order.additional_payment_proof_url),
    paymentMethod: cleanText(order.payment_method_name),
    paymentStatusLabel: PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus,
    isPaymentConfirmed: paymentStatus === 'paid',
    items,
    itemsSubtotal,
    grandTotal,
    qrValue,
  };
}

// "Batch #3 · Recovery drop" — the label a group-buy waybill carries.
export function formatBatchLabel(
  batchNumber: number | null | undefined,
  name: string | null | undefined,
): string | null {
  if (batchNumber == null) return cleanText(name);
  const suffix = cleanText(name);
  return `Batch #${batchNumber}${suffix ? ` · ${suffix}` : ''}`;
}
