import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  Truck,
  XCircle,
  Image as ImageIcon,
  Tag,
} from 'lucide-react';
import { useCouriers } from '../../hooks/useCouriers';
import { ORDER_STATUS_OPTIONS, orderStatusLabel } from '../../utils/orderTracking';
import type { BatchOrder, OrderLineItem, Product } from '../../types';
import type { RequestConfirm } from './ConfirmDialog';
import { OrderItemsEditor } from './OrderItemsEditor';
import { batchStatusColor, peso, formatDateTime } from './orderStatusStyles';

interface TrackingInput {
  tracking_number: string | null;
  shipping_provider: string | null;
  shipping_note: string | null;
}

interface BatchOrderDetailProps {
  order: BatchOrder;
  products: Product[];
  busy: boolean;
  requestConfirm: RequestConfirm;
  onBack: () => void;
  onConfirm: (order: BatchOrder) => void;
  onUpdateStatus: (orderId: string, status: string) => void;
  onCancel: (orderId: string) => void;
  onSaveTracking: (orderId: string, tracking: TrackingInput) => void;
  onSaveItems: (orderId: string, items: OrderLineItem[]) => void;
}

/**
 * Manage one order inside a group-buy batch. Confirm marks confirmed+paid with NO
 * inventory deduction (group-buy pre-orders are capped, not stock-backed). Also
 * exposes status changes, cancellation, the tracking editor, the payment proof,
 * and the embedded items editor used to add claimed units onto the order.
 */
export function BatchOrderDetail({
  order,
  products,
  busy,
  requestConfirm,
  onBack,
  onConfirm,
  onUpdateStatus,
  onCancel,
  onSaveTracking,
  onSaveItems,
}: BatchOrderDetailProps) {
  const { couriers } = useCouriers();
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? '');
  // Seed from the stored provider only; never default to a hardcoded courier, which
  // could silently overwrite shipping_provider with the wrong value on save.
  const [shippingProvider, setShippingProvider] = useState(order.shipping_provider ?? '');
  const [shippingNote, setShippingNote] = useState(order.shipping_note ?? '');

  useEffect(() => {
    setTrackingNumber(order.tracking_number ?? '');
    setShippingProvider(order.shipping_provider ?? '');
    setShippingNote(order.shipping_note ?? '');
  }, [order.id, order.tracking_number, order.shipping_provider, order.shipping_note]);

  const selectedCourier = couriers.find((c) => c.code === shippingProvider);
  const trackingUrl =
    selectedCourier?.tracking_url_template && trackingNumber
      ? selectedCourier.tracking_url_template.replace('{tracking}', trackingNumber)
      : null;

  const isCancelled = order.order_status === 'cancelled';
  const isNew = order.order_status === 'new';

  const handleStatusSelect = (value: string) => {
    if (value === order.order_status) return;
    // Always route confirmation through onConfirm so it marks paid consistently,
    // however the order reached 'confirmed' (not just from the 'new' state).
    if (value === 'confirmed') {
      onConfirm(order);
    } else if (value === 'cancelled') {
      handleCancel();
    } else {
      onUpdateStatus(order.id, value);
    }
  };

  const handleCancel = () =>
    requestConfirm({
      title: 'Cancel this order?',
      message: 'It frees any capped units back into the batch for others to claim.',
      confirmLabel: 'Cancel order',
      tone: 'danger',
      onConfirm: () => onCancel(order.id),
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-gray-700 hover:text-indigo-600 transition-colors flex items-center gap-1 group text-xs md:text-sm"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Back to batch orders
        </button>
        {order.is_claim && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold">
            <Tag className="h-3 w-3" />
            Claim add-on
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5 space-y-5">
        {/* Header: order number + status controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-bold text-gray-900 font-mono">
              {order.order_number || order.id.slice(0, 8).toUpperCase()}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {order.customer_name} • Placed {formatDateTime(order.created_at)}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <span
              className={`inline-flex items-center justify-center px-3 py-1.5 rounded-full text-xs font-semibold border ${batchStatusColor(
                order.order_status,
              )}`}
            >
              {orderStatusLabel(order.order_status)}
            </span>
            {isNew && (
              <button
                type="button"
                onClick={() => onConfirm(order)}
                disabled={busy}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs md:text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                {busy ? 'Processing…' : 'Confirm order'}
              </button>
            )}
            {!isCancelled && (
              <select
                value={order.order_status}
                onChange={(e) => handleStatusSelect(e.target.value)}
                disabled={busy}
                aria-label="Order status"
                className="px-3 py-2 border border-gray-300 rounded-lg text-xs md:text-sm font-medium bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-50 cursor-pointer"
              >
                {!ORDER_STATUS_OPTIONS.some((o) => o.value === order.order_status) && (
                  <option value={order.order_status}>{orderStatusLabel(order.order_status)}</option>
                )}
                {ORDER_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <p className="text-[11px] text-gray-400 -mt-2">
          Confirming a group-buy order marks it paid without deducting inventory stock — these are
          pre-orders against the batch cap.
        </p>

        {/* Customer + payment summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-900 space-y-1">
            <p className="font-bold text-gray-900 text-sm mb-1">Customer</p>
            <p>
              <span className="font-semibold">Name:</span> {order.customer_name}
            </p>
            <p>
              <span className="font-semibold">Email:</span> {order.customer_email}
            </p>
            <p>
              <span className="font-semibold">Phone:</span> {order.customer_phone}
            </p>
            {order.contact_method && (
              <p>
                <span className="font-semibold">Contact (FB/WhatsApp):</span> {order.contact_method}
              </p>
            )}
            {order.selected_sticker_name && (
              <p>
                <span className="font-semibold">Sticker:</span> {order.selected_sticker_name}
              </p>
            )}
            {order.shipping_address && (
              <p className="pt-1">
                <span className="font-semibold">Ships to:</span> {order.shipping_address}
                {order.shipping_city ? `, ${order.shipping_city}` : ''}
              </p>
            )}
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-900 space-y-1">
            <p className="font-bold text-gray-900 text-sm mb-1">Payment</p>
            <p>
              <span className="font-semibold">Method:</span> {order.payment_method_name || 'N/A'}
            </p>
            <p className="flex items-center gap-2">
              <span className="font-semibold">Status:</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  order.payment_status === 'paid'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {order.payment_status === 'paid' ? 'Paid' : 'Pending'}
              </span>
            </p>
            <p>
              <span className="font-semibold">Subtotal:</span> {peso(order.subtotal)}
            </p>
            <p>
              <span className="font-semibold">Total:</span>{' '}
              <span className="font-bold">{peso(order.total_price)}</span>
            </p>
          </div>
        </div>

        {/* Payment proof */}
        {order.payment_proof_url && (
          <div>
            <h3 className="font-bold text-gray-900 mb-2 text-sm flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Payment proof
            </h3>
            <div className="bg-gray-50 rounded-lg p-3">
              <img
                src={order.payment_proof_url}
                alt="Payment proof"
                className="max-w-full md:max-w-md h-auto rounded-lg border border-gray-300"
              />
            </div>
          </div>
        )}

        {/* Items editor */}
        <div>
          <h3 className="font-bold text-gray-900 mb-2 text-sm">Order items</h3>
          <OrderItemsEditor
            items={order.order_items}
            products={products}
            busy={busy}
            onSave={(items) => onSaveItems(order.id, items)}
          />
        </div>

        {/* Tracking editor */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
          <h3 className="font-bold text-navy-900 mb-3 flex items-center gap-2 text-sm">
            <Truck className="h-4 w-4 text-blue-600" />
            Tracking
          </h3>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-col md:flex-row gap-2">
              <select
                value={shippingProvider}
                onChange={(e) => setShippingProvider(e.target.value)}
                disabled={busy}
                aria-label="Courier"
                className="px-3 py-2 border border-gray-300 rounded-lg text-xs md:text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
              >
                {/* Fallback so an unmatched/empty provider renders visibly instead of
                    silently defaulting to the first active courier on save. */}
                <option value="">Select courier…</option>
                {/* Surface a saved provider that is no longer an active courier so the
                    controlled value still has a matching option. */}
                {shippingProvider &&
                  !couriers.some((c) => c.is_active && c.code === shippingProvider) && (
                    <option value={shippingProvider}>{shippingProvider}</option>
                  )}
                {couriers
                  .filter((c) => c.is_active)
                  .map((courier) => (
                    <option key={courier.id} value={courier.code}>
                      {courier.name}
                    </option>
                  ))}
              </select>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Enter tracking number"
                disabled={busy}
                aria-label="Tracking number"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs md:text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
              />
              {trackingUrl && (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 flex items-center justify-center"
                  title="Track shipment"
                >
                  <Truck className="h-4 w-4" />
                </a>
              )}
            </div>
            <input
              type="text"
              value={shippingNote}
              onChange={(e) => setShippingNote(e.target.value)}
              placeholder="Shipping note (optional)"
              disabled={busy}
              aria-label="Shipping note"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs md:text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() =>
                onSaveTracking(order.id, {
                  tracking_number: trackingNumber || null,
                  shipping_provider: shippingProvider || null,
                  shipping_note: shippingNote || null,
                })
              }
              disabled={busy}
              className="self-end px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs md:text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save tracking'}
            </button>
          </div>
        </div>

        {/* Admin notes audit trail */}
        {order.admin_notes && (
          <div>
            <h3 className="font-bold text-gray-900 mb-2 text-sm">Admin notes</h3>
            <pre className="bg-gray-50 rounded-lg p-3 text-[11px] text-gray-600 whitespace-pre-wrap font-mono">
              {order.admin_notes}
            </pre>
          </div>
        )}

        {/* Cancel */}
        {!isCancelled && (
          <div className="border-t border-gray-200 pt-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-lg text-xs md:text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Cancel order
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default BatchOrderDetail;
