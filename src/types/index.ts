// Peptide Product Types
export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  base_price: number;
  discount_price: number | null;
  discount_start_date: string | null;
  discount_end_date: string | null;
  discount_active: boolean;

  // Peptide-specific fields
  purity_percentage: number;
  molecular_weight: string | null;
  cas_number: string | null;
  sequence: string | null;
  storage_conditions: string;
  inclusions: string[] | null;

  // Stock and availability
  stock_quantity: number;
  available: boolean;
  featured: boolean;

  // Minimum vials a shopper must order for this product (default 2). A selected
  // variation's own minimum overrides this — see resolveMinOrder().
  minimum_order_quantity?: number;

  // Vials that make one COMPLETE kit for this product. NULL/absent means inherit
  // DEFAULT_VIALS_PER_KIT — see resolveKitSize(). Drives the Ligwak allocation.
  vials_per_kit?: number | null;

  // Images and metadata
  image_url: string | null;
  safety_sheet_url: string | null;

  created_at: string;
  updated_at: string;

  // Relations
  variations?: ProductVariation[];
}

export interface ProductVariation {
  id: string;
  product_id: string;
  name: string;
  quantity_mg: number;
  price: number;
  // Pen type pricing - null means not available for this product
  disposable_pen_price: number | null;
  reusable_pen_price: number | null;
  discount_price: number | null;
  discount_active: boolean;
  stock_quantity: number;
  // Minimum vials a shopper must order for this variation (default 2). Overrides
  // the parent product's minimum when this variation is selected.
  minimum_order_quantity?: number;

  // Vials that make one COMPLETE kit for this variation. Overrides the parent
  // product's kit size — different strengths ship in their own kits.
  vials_per_kit?: number | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  active: boolean;
  /** When true, products in this category are free for everyone to order — no paid access. */
  is_free: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  account_number: string;
  account_name: string;
  qr_code_url: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// A promotional sticker design a customer can opt to include with their order.
// Admin-managed (mirrors couriers/payment_methods): active rows are offered at
// checkout, ordered by sort_order.
export interface Sticker {
  id: string;
  name: string;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface SiteSetting {
  id: string;
  value: string;
  type: string;
  description: string | null;
  updated_at: string;
}

export interface SiteSettings {
  site_name: string;
  site_logo: string;
  site_description: string;
  currency: string;
  currency_code: string;
  hero_badge_text?: string;
  hero_title_prefix?: string;
  hero_title_highlight?: string;
  hero_title_suffix?: string;
  hero_subtext?: string;
  hero_tagline?: string;
  hero_description?: string;
  hero_accent_color?: string;
}

// Pen Type Options (for injectable products)

// Cart Types
export interface CartItem {
  product: Product;
  variation?: ProductVariation;
  quantity: number;
}

// Order Types
export interface OrderDetails {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  payment_method: string;
  notes?: string;
  promo_code?: string;
  discount_applied?: number;
}

export interface PromoCode {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_purchase_amount: number;
  max_discount_amount?: number;
  start_date?: string;
  end_date?: string;
  usage_limit?: number;
  usage_count: number;
  active: boolean;
  created_at: string;
}

// Group Buy Types
//
// Batch lifecycle state machine:
//   open  ──▶ finalizing ──▶ finalized ──▶ closed
//    │            │
//    └────────────┘  (reopen — admin escape hatch)
//
//   open       — accepting new customer orders (checkout enabled, one at a time)
//   finalizing — ordering closed to new customers; admin confirms each order and
//                cancels no-shows; freed capped units become claimable
//   finalized  — totals locked, claims closed; admin drives delivery
//   closed     — archived / complete
export type GroupBuyStatus = 'open' | 'finalizing' | 'finalized' | 'closed';

// Shared international-leg shipment stage for a whole batch (supplier -> PH).
// null means the batch has not entered fulfillment yet.
export type FulfillmentStage = 'preparing' | 'in_logistics' | 'enroute_ph' | 'arrived_ph';

export interface GroupBuyBatch {
  id: string;
  batch_number: number;
  status: GroupBuyStatus;
  name: string | null;
  opened_at: string;
  closed_at: string | null;
  finalized_at: string | null;
  opened_by?: string | null;
  created_at?: string;
  fulfillment_stage: FulfillmentStage | null;
  /** Admin-set paid access fee for this batch (PHP). Members pay this per batch. */
  access_fee?: number;
  /** Admin-announced start of the group buy window (TIMESTAMPTZ). Display-only. */
  starts_at?: string | null;
  /** Admin-announced finish/deadline of the group buy window (TIMESTAMPTZ). Display-only. */
  ends_at?: string | null;
  /**
   * "Pasalo mode": when true, the storefront shows only this batch's capped
   * products that still have remaining slots. Drives a re-opening phase where
   * shoppers see only items still needing orders. Default false.
   */
  pasalo_mode?: boolean;
  /**
   * "View-only mode": when true, the storefront still shows this batch's products
   * (browsable, drawer openable) but Add-to-Cart is disabled everywhere — a
   * pre-launch/preview phase. Flip it off to "allow adding now". Default false.
   */
  view_only_mode?: boolean;
}

export interface GroupBuyCap {
  id: string;
  batch_id: string;
  product_id: string;
  // NULL = product-level cap (covers the product's uncapped variations as a shared
  // pool). Non-null = a cap on that specific variation, which overrides the product
  // cap for it. See remainingForVariation() for the resolution rule.
  variation_id: string | null;
  cap_quantity: number;
  created_at: string;
  updated_at: string;
}

// Per-variation slice of a product's demand for a batch, emitted by
// get_group_buy_progress. total_quantity counts non-cancelled units of that
// variation; cap_quantity is the variation's own cap (null = no variation cap, so
// it falls back to the product-level cap_quantity on the parent item).
export interface GroupBuyProgressVariation {
  variation_id: string;
  variation_name: string | null;
  total_quantity: number;
  cap_quantity: number | null;
}

// Per-product aggregate returned by the get_group_buy_progress RPC. Totals count
// NON-cancelled orders only; cancelled_quantity is the freed/claimable surplus.
export interface GroupBuyProgressItem {
  product_id: string;
  product_name: string | null;
  total_quantity: number;
  /** Non-cancelled units whose order has moved past `new` (admin-confirmed). */
  confirmed_quantity: number;
  order_count: number;
  cancelled_quantity: number;
  cap_quantity: number | null;
  /** Per-variation breakdown (present when the product has variation-level data). */
  variations?: GroupBuyProgressVariation[];
}

export interface GroupBuyProgress {
  batch: Pick<
    GroupBuyBatch,
    | 'id'
    | 'batch_number'
    | 'name'
    | 'status'
    | 'opened_at'
    | 'closed_at'
    | 'finalized_at'
    | 'fulfillment_stage'
    | 'starts_at'
    | 'ends_at'
    | 'pasalo_mode'
    | 'view_only_mode'
  > | null;
  items: GroupBuyProgressItem[];
}

// Per-capped-product leftover for a finalizing batch (get_group_buy_remaining).
// PII-free aggregate; powers the admin leftover panel and customer claim panel.
export interface GroupBuyRemainingItem {
  product_id: string;
  product_name: string | null;
  cap_quantity: number;
  reserved: number;
  remaining: number;
}

export interface GroupBuyRemaining {
  batch_status: GroupBuyStatus | null;
  items: GroupBuyRemainingItem[];
}

// A line item inside orders.order_items (JSONB).
export interface OrderLineItem {
  product_id: string;
  product_name: string;
  variation_id: string | null;
  variation_name: string | null;
  quantity: number;
  price: number;
  total: number;
  purity_percentage?: number;
}

// A line item enriched for the customer-facing Order History: the same stored
// item plus its exact strength in mg. quantity_mg lives on product_variations
// and was not copied into order_items historically, so the history RPC recovers
// it by join (a value stored on the item itself wins — see the RPC's comment).
export interface OrderHistoryLineItem extends OrderLineItem {
  quantity_mg?: number | null;
}

// One recorded change of state, from public.order_status_events, plus the batch's
// shared international leg merged in under 'fulfillment_stage'.
export interface OrderStatusEvent {
  event_type: 'placed' | 'order_status' | 'payment_status' | 'fulfillment_stage';
  from_value: string | null;
  to_value: string | null;
  occurred_at: string;
}

// One row of the detailed customer-facing Order History
// (get_order_history_by_email / get_order_history_by_number).
//
// This is deliberately NOT OrderBundleRow. That type backs the status-only
// lookup any order number can reach; this one carries the customer's own
// personal and checkout data and is returned only to a lookup that proved
// ownership. Keep the two apart.
export interface OrderHistoryRow {
  id: string;
  order_number: string | null;
  created_at: string;

  // Who placed it
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  contact_method: string | null;

  // What else was entered at checkout
  shipping_address: string | null;
  shipping_barangay: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip_code: string | null;
  shipping_country: string | null;
  shipping_location: string | null;
  shipping_provider: string | null;
  shipping_note: string | null;
  tracking_number: string | null;
  selected_sticker_name: string | null;
  /** The customer's own note / special instructions. Admin notes are never sent. */
  notes: string | null;

  // Which group buy it rides in
  group_buy_batch_id: string | null;
  batch_name: string | null;
  batch_number: number | null;
  batch_status: GroupBuyStatus | null;
  fulfillment_stage: FulfillmentStage | null;

  // What was ordered, and what it cost
  order_items: OrderHistoryLineItem[];
  total_price: number;
  shipping_fee: number;
  discount_applied: number | null;
  promo_code: string | null;
  paid_total: number | null;
  balance_due: number;
  refunded_total: number | null;

  // How it is being paid, and where it stands
  payment_type: string | null;
  payment_method_name: string | null;
  payment_status: string;
  order_status: string | null;

  // How it got here
  status_events: OrderStatusEvent[];

  is_claim: boolean;
  parent_order_id: string | null;
}

// An order as managed inside a group-buy batch (admin side).
export interface BatchOrder {
  id: string;
  order_number: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  contact_method: string | null;
  selected_sticker_id: string | null;
  selected_sticker_name: string | null;
  shipping_address: string | null;
  shipping_barangay: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip_code: string | null;
  shipping_country: string | null;
  shipping_location: string | null;
  order_items: OrderLineItem[];
  subtotal: number | null;
  total_price: number | null;
  shipping_fee: number | null;
  // Total confirmed paid so far. balance_due = max(0, total_price - paid_total).
  // NULL means the order was never confirmed paid.
  paid_total: number | null;
  payment_method_name: string | null;
  payment_proof_url: string | null;
  // Receipt covering the balance owed after items were added post-payment.
  additional_payment_proof_url: string | null;
  // 'pay_now' | 'cod'. Absent on rows predating the payment-option split.
  payment_type?: string | null;
  refunded_total?: number | null;
  // Set when an admin confirmed this order despite an unverified payment.
  manually_confirmed_at?: string | null;
  manually_confirmed_by?: string | null;
  // 'pending' | 'submitted' (balance receipt under review) | 'paid' | 'failed'.
  payment_status: string;
  order_status: string;
  admin_notes: string | null;
  notes: string | null;
  tracking_number: string | null;
  shipping_provider: string | null;
  shipping_note: string | null;
  group_buy_batch_id: string | null;
  parent_order_id: string | null;
  is_claim: boolean;
  created_at: string;
  updated_at: string;
}

// One row of the customer-facing tracking bundle (get_order_bundle): the root
// order plus any linked claim/add-on orders, shown under one lookup.
export interface OrderBundleRow {
  id: string;
  order_number: string | null;
  order_status: string | null;
  payment_status: string;
  payment_method_name: string | null;
  tracking_number: string | null;
  shipping_provider: string | null;
  shipping_note: string | null;
  total_price: number;
  shipping_fee: number;
  // The RPC returns the whole stored JSONB; this was narrowed by hand and
  // hid the price/variation fields that were always present.
  order_items: OrderLineItem[];
  created_at: string;
  promo_code: string | null;
  discount_applied: number | null;
  fulfillment_stage: FulfillmentStage | null;
  is_claim: boolean;
  parent_order_id: string | null;
  group_buy_batch_id: string | null;
  batch_status: GroupBuyStatus | null;
  // Total confirmed paid so far (NULL if never confirmed paid).
  paid_total: number | null;
  // 'pay_now' | 'cod'. Absent on rows predating the payment-option split.
  payment_type?: string | null;
  refunded_total?: number | null;
  manually_confirmed_at?: string | null;
  // Outstanding balance owed after items were added post-payment (0 when none).
  balance_due: number;
}
