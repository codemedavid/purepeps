import { allocateKits, type AllocatableOrder, type KitAllocation } from './ligwak';
import { computeLigwakRefund } from './ligwakRefund';
import type { LigwakRefundStatus } from '../constants/ligwak';

/**
 * Turns a whole group-buy batch into its kit allocations and the ligwak records
 * that follow from them. Pure, so the admin preview and the finalize path can
 * agree on the numbers without either of them owning the maths.
 *
 * Composed from the two rules that live next door:
 *   * ./ligwak         — WHO is ligwak (oldest-first packing, per vial)
 *   * ./ligwakRefund   — WHAT they are owed (measured against actual payment)
 *
 * The one rule that can only be decided here is whether an order is ligwak in
 * its ENTIRETY. That is a cross-stream question: an order with a 10mg line that
 * filled a kit and a 5mg line that did not is still shipping, so its shipping
 * fee stays put. Neither single-stream module can see that.
 */

/** An order line carrying everything a ligwak record snapshots. */
export interface LigwakSourceLineItem {
  readonly product_id: string;
  readonly product_name: string | null;
  readonly variation_id: string | null;
  readonly variation_name: string | null;
  /** Exact strength, shown on the admin dashboard. */
  readonly quantity_mg?: number | null;
  readonly quantity: number;
  readonly price: number;
}

/** A batch order with the customer and money fields a record needs. */
export interface LigwakSourceOrder extends AllocatableOrder {
  readonly customer_name: string;
  readonly customer_email: string;
  readonly customer_phone: string;
  readonly payment_method_name?: string | null;
  readonly subtotal?: number | null;
  readonly total_price?: number | null;
  readonly shipping_fee?: number | null;
  readonly paid_total?: number | null;
  readonly refunded_total?: number | null;
  readonly order_items: readonly LigwakSourceLineItem[];
}

/** One customer's vials left outside a complete kit, priced. */
export interface LigwakRecordDraft {
  readonly orderId: string;
  readonly orderNumber: string | null;
  readonly orderedAt: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly customerPhone: string;
  readonly productId: string;
  readonly productName: string | null;
  readonly variationId: string | null;
  readonly variationName: string | null;
  readonly quantityMg: number | null;
  readonly totalQuantity: number;
  readonly confirmedQuantity: number;
  readonly ligwakQuantity: number;
  readonly refundAmount: number;
  readonly shippingRefunded: number;
  readonly refundStatus: LigwakRefundStatus;
  readonly paymentType: string | null;
  readonly paymentStatus: string | null;
  readonly paymentMethodName: string | null;
  readonly reason: string;
}

export interface LigwakTotals {
  /** Distinct orders affected — an order with two ligwak lines counts once. */
  readonly affectedOrders: number;
  readonly ligwakVials: number;
  readonly refundOwed: number;
}

export interface BatchLigwak {
  readonly allocations: readonly KitAllocation[];
  readonly records: readonly LigwakRecordDraft[];
  readonly totals: LigwakTotals;
}

/** Resolves the kit size for one stream, so callers own the product lookup. */
export type KitSizeResolver = (productId: string, variationId: string | null) => number;

function streamKey(productId: string, variationId: string | null): string {
  return `${productId}:${variationId ?? ''}`;
}

/** Every (product, variation) queue that appears anywhere in the batch. */
function discoverStreams(
  orders: readonly LigwakSourceOrder[],
): Array<{ productId: string; variationId: string | null }> {
  const seen = new Map<string, { productId: string; variationId: string | null }>();
  for (const order of orders) {
    for (const item of order.order_items) {
      const variationId = item.variation_id ?? null;
      const key = streamKey(item.product_id, variationId);
      if (!seen.has(key)) seen.set(key, { productId: item.product_id, variationId });
    }
  }
  return [...seen.values()];
}

/** The first line of this stream on this order — the price/name snapshot source. */
function findLine(
  order: LigwakSourceOrder,
  productId: string,
  variationId: string | null,
): LigwakSourceLineItem | undefined {
  return order.order_items.find(
    (item) => item.product_id === productId && (item.variation_id ?? null) === variationId,
  );
}

/**
 * Allocate every stream in the batch and price the resulting ligwak vials.
 *
 * Streams with no ligwak at all still appear in `allocations` — the admin
 * preview needs to show the kits that DID complete, not only the failures.
 */
export function buildBatchLigwak(
  orders: readonly LigwakSourceOrder[],
  kitSizeOf: KitSizeResolver,
): BatchLigwak {
  const allocations = discoverStreams(orders)
    .map(({ productId, variationId }) =>
      allocateKits(orders, {
        productId,
        variationId,
        kitSize: kitSizeOf(productId, variationId),
      }),
    )
    // A stream whose orders were all ineligible has nothing to show or refund.
    .filter((allocation) => allocation.totalConfirmedVials > 0);

  // An order ships unless EVERY vial it holds, across every stream, is ligwak.
  // Computed once up front because each record needs the whole-order answer.
  const orderVials = new Map<string, { total: number; ligwak: number }>();
  for (const allocation of allocations) {
    for (const entry of allocation.entries) {
      const running = orderVials.get(entry.orderId) ?? { total: 0, ligwak: 0 };
      orderVials.set(entry.orderId, {
        total: running.total + entry.quantity,
        ligwak: running.ligwak + entry.ligwakQty,
      });
    }
  }
  const isEntirelyLigwak = (orderId: string): boolean => {
    const tally = orderVials.get(orderId);
    return tally != null && tally.total > 0 && tally.ligwak === tally.total;
  };

  const byId = new Map(orders.map((order) => [order.id, order]));
  // The shipping fee is charged once per ORDER, so it can only be given back
  // once. An order that is entirely ligwak across three lines produces three
  // records, and only the first of them may carry the fee.
  const shippingClaimed = new Set<string>();
  // Refund money still unspent on each order. paid_total belongs to the ORDER,
  // so an order with two ligwak lines must not cap each of them against the same
  // undecremented figure — that is how the combined refunds come to exceed what
  // the customer ever paid.
  const headroomLeft = new Map<string, number>();
  const records: LigwakRecordDraft[] = [];

  for (const allocation of allocations) {
    for (const entry of allocation.entries) {
      if (entry.ligwakQty <= 0) continue;

      const order = byId.get(entry.orderId);
      if (!order) continue;
      const item = findLine(order, allocation.productId, allocation.variationId);
      if (!item) continue;

      const claimsShipping =
        isEntirelyLigwak(entry.orderId) && !shippingClaimed.has(entry.orderId);
      if (claimsShipping) shippingClaimed.add(entry.orderId);

      if (!headroomLeft.has(entry.orderId)) {
        headroomLeft.set(
          entry.orderId,
          Math.max(
            0,
            Number(order.paid_total ?? 0) - Number(order.refunded_total ?? 0),
          ),
        );
      }

      const refund = computeLigwakRefund({
        order,
        linePrice: item.price,
        lineQuantity: entry.quantity,
        ligwakQty: entry.ligwakQty,
        isEntireOrderLigwak: claimsShipping,
        headroomRemaining: headroomLeft.get(entry.orderId),
      });

      headroomLeft.set(
        entry.orderId,
        Math.max(0, (headroomLeft.get(entry.orderId) ?? 0) - refund.refundAmount),
      );

      records.push({
        orderId: entry.orderId,
        orderNumber: entry.orderNumber,
        orderedAt: entry.orderedAt,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        customerPhone: order.customer_phone,
        productId: allocation.productId,
        productName: item.product_name,
        variationId: allocation.variationId,
        variationName: item.variation_name,
        quantityMg: item.quantity_mg ?? null,
        totalQuantity: entry.quantity,
        confirmedQuantity: entry.confirmedQty,
        ligwakQuantity: entry.ligwakQty,
        refundAmount: refund.refundAmount,
        shippingRefunded: refund.shippingRefunded,
        refundStatus: refund.refundStatus,
        paymentType: order.payment_type ?? null,
        paymentStatus: order.payment_status ?? null,
        paymentMethodName: order.payment_method_name ?? null,
        reason: `Included in the final incomplete kit when the group buy closed (${allocation.kitSize} vials per kit).`,
      });
    }
  }

  return {
    allocations,
    records,
    totals: {
      affectedOrders: new Set(records.map((r) => r.orderId)).size,
      ligwakVials: records.reduce((sum, r) => sum + r.ligwakQuantity, 0),
      refundOwed: records.reduce((sum, r) => sum + r.refundAmount, 0),
    },
  };
}
