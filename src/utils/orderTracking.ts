import type { FulfillmentStage, OrderBundleRow } from '../types';

/**
 * Pure order-tracking timeline logic, shared by the customer Order Tracking page
 * and the admin Group Buy / Orders managers. Side-effect free so the timeline
 * rules can be unit tested without React or Supabase.
 *
 * Two fields drive ONE timeline:
 *   - group_buy_batches.fulfillment_stage — the shared INTERNATIONAL leg, advanced
 *     once per batch by an admin (steps 2..5: supplier -> logistics -> PH).
 *   - orders.order_status — the per-order LOCAL leg (steps 0,1 and 6..8) plus the
 *     terminal `cancelled` state.
 *
 * computeTrackingStep merges them by taking whichever leg is further along, so a
 * single batch-stage update moves every order in the batch forward while the
 * local delivery leg is still managed per order.
 */

export type OrderStatus =
  | 'new'
  | 'confirmed'
  | 'packing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface TrackingStep {
  readonly key: string;
  readonly label: string;
  readonly message: string;
}

export const TRACKING_STEPS: readonly TrackingStep[] = [
  {
    key: 'placed',
    label: 'Placed',
    message: 'We have received your order. It is queued in the current group buy.',
  },
  {
    key: 'confirmed',
    label: 'Confirmed',
    message: 'Your payment is confirmed and your order is locked into this batch.',
  },
  {
    key: 'preparing',
    label: 'Supplier preparing',
    message: 'The supplier is preparing this batch for shipment.',
  },
  {
    key: 'in_logistics',
    label: 'In logistics',
    message: 'Your batch has left the supplier and is moving through international logistics.',
  },
  {
    key: 'enroute_ph',
    label: 'On the way to PH',
    message: 'Your batch is on its way to the Philippines.',
  },
  {
    key: 'arrived_ph',
    label: 'Arrived in PH',
    message: 'Your batch has arrived in the Philippines and is being processed for local delivery.',
  },
  {
    key: 'packing',
    label: 'Packing',
    message: 'We are packing your order for delivery.',
  },
  {
    key: 'out_for_delivery',
    label: 'Out for delivery',
    message: 'Your order is out for delivery and on its way to you.',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    message: 'Your order has been delivered. Thank you!',
  },
];

// Sentinel for "this leg contributes no progress" — below every real step index
// so Math.max() always prefers a real step. Also the step value when cancelled.
const NO_STEP = -1;
const PLACED_STEP = 0;

// order_status -> timeline index (local leg). Includes legacy values mapped to
// the closest current step so historical orders still render sensibly.
const ORDER_STATUS_STEP: Readonly<Record<string, number>> = {
  new: 0,
  confirmed: 1,
  packing: 6,
  out_for_delivery: 7,
  delivered: 8,
  processing: 6, // legacy
  shipped: 7, // legacy
};

// fulfillment_stage -> timeline index (international leg).
const FULFILLMENT_STAGE_STEP: Readonly<Record<FulfillmentStage, number>> = {
  preparing: 2,
  in_logistics: 3,
  enroute_ph: 4,
  arrived_ph: 5,
};

export const FULFILLMENT_STAGES: readonly { value: FulfillmentStage; label: string }[] = [
  { value: 'preparing', label: 'Supplier preparing' },
  { value: 'in_logistics', label: 'In logistics' },
  { value: 'enroute_ph', label: 'On the way to PH' },
  { value: 'arrived_ph', label: 'Arrived in PH' },
];

// Local-leg statuses an admin can set per order (the international leg is set on
// the batch, not here). Order matches the natural delivery progression.
export const ORDER_STATUS_OPTIONS: readonly { value: OrderStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'packing', label: 'Packing' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const ORDER_STATUS_LABELS: Readonly<Record<string, string>> = {
  new: 'New',
  confirmed: 'Confirmed',
  packing: 'Packing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  processing: 'Processing', // legacy
  shipped: 'Shipped', // legacy
};

export function orderStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function fulfillmentStageLabel(stage: string | null | undefined): string {
  if (!stage) return 'Not started';
  const match = FULFILLMENT_STAGES.find((s) => s.value === stage);
  return match ? match.label : 'Not started';
}

export interface TrackingState {
  /** Timeline index 0..TRACKING_STEPS.length-1, or -1 when cancelled. */
  readonly step: number;
  readonly isCancelled: boolean;
  /** The active step, or null when cancelled. */
  readonly current: TrackingStep | null;
}

/** A bundle order paired with its customer-facing sequence label ("Order 2"). */
export interface SequencedOrder {
  readonly order: OrderBundleRow;
  /** 1-based position in the customer's order sequence. */
  readonly sequence: number;
  readonly label: string;
}

/**
 * Number the customer's own orders within one tracking bundle.
 *
 * A repeat checkout from the same email in the same open batch is linked to the
 * first order via parent_order_id (server-side trigger), so all the customer's
 * orders share one tracking lookup. This returns those linked orders — the root
 * first, then each repeat by creation time — labelled "Order 1", "Order 2", …
 *
 * Leftover-claim add-ons (is_claim) are excluded: they render in their own
 * "Add-ons" section, not the numbered order sequence.
 */
export function sequenceBundleOrders(bundle: readonly OrderBundleRow[]): SequencedOrder[] {
  const ownOrders = bundle.filter((row) => !row.is_claim);

  const ordered = [...ownOrders].sort((a, b) => {
    // The root (no parent) is always Order 1; repeats follow by creation time.
    const aIsRoot = a.parent_order_id == null ? 0 : 1;
    const bIsRoot = b.parent_order_id == null ? 0 : 1;
    if (aIsRoot !== bIsRoot) return aIsRoot - bIsRoot;
    return a.created_at.localeCompare(b.created_at);
  });

  return ordered.map((order, index) => ({
    order,
    sequence: index + 1,
    label: `Order ${index + 1}`,
  }));
}

export function computeTrackingStep(
  orderStatus: string | null | undefined,
  fulfillmentStage: string | null | undefined,
): TrackingState {
  if (orderStatus === 'cancelled') {
    return { step: NO_STEP, isCancelled: true, current: null };
  }

  const localStep = ORDER_STATUS_STEP[orderStatus ?? ''] ?? PLACED_STEP;
  const batchStep =
    fulfillmentStage != null
      ? FULFILLMENT_STAGE_STEP[fulfillmentStage as FulfillmentStage] ?? NO_STEP
      : NO_STEP;

  const step = Math.max(localStep, batchStep);
  return {
    step,
    isCancelled: false,
    current: TRACKING_STEPS[step] ?? TRACKING_STEPS[PLACED_STEP],
  };
}
