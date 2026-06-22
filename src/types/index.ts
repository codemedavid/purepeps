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
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  active: boolean;
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
}

export interface GroupBuyCap {
  id: string;
  batch_id: string;
  product_id: string;
  cap_quantity: number;
  created_at: string;
  updated_at: string;
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

// An order as managed inside a group-buy batch (admin side).
export interface BatchOrder {
  id: string;
  order_number: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  contact_method: string | null;
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
  payment_method_name: string | null;
  payment_proof_url: string | null;
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
  tracking_number: string | null;
  shipping_provider: string | null;
  shipping_note: string | null;
  total_price: number;
  shipping_fee: number;
  order_items: { product_name: string; quantity: number }[];
  created_at: string;
  promo_code: string | null;
  discount_applied: number | null;
  fulfillment_stage: FulfillmentStage | null;
  is_claim: boolean;
  parent_order_id: string | null;
  group_buy_batch_id: string | null;
  batch_status: GroupBuyStatus | null;
}
