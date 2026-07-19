import type { SavedCheckoutInfo } from '../hooks/useCheckoutInfo';

/**
 * Contact + shipping columns returned by the get_checkout_prefill_by_email RPC
 * for a returning customer's most-recent order. Mirrors the SQL RETURNS TABLE
 * shape; every column is nullable because older orders may predate a field.
 */
export interface CheckoutPrefillRow {
  customer_name: string | null;
  customer_phone: string | null;
  contact_method: string | null;
  shipping_address: string | null;
  shipping_barangay: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip_code: string | null;
  courier_id: string | null;
  shipping_location: string | null;
}

const coalesce = (value: string | null | undefined): string => value ?? '';

/**
 * Convert a returning customer's prior-order row into the SavedCheckoutInfo shape
 * the checkout form prefills from. The email comes from the caller (the verified
 * member identity used for the lookup), never from the row, so a prefill can only
 * ever populate the identity we already trust. Returns null when there is no row.
 */
export function mapPrefillRowToCheckoutInfo(
  row: CheckoutPrefillRow | null,
  email: string,
): SavedCheckoutInfo | null {
  if (!row) return null;

  const contactMethod = coalesce(row.contact_method).trim();

  return {
    fullName: coalesce(row.customer_name),
    email,
    phone: coalesce(row.customer_phone),
    contactMethod: contactMethod || undefined,
    address: coalesce(row.shipping_address),
    barangay: coalesce(row.shipping_barangay),
    city: coalesce(row.shipping_city),
    state: coalesce(row.shipping_state),
    zipCode: coalesce(row.shipping_zip_code),
    selectedCourierId: coalesce(row.courier_id),
    shippingLocation: coalesce(row.shipping_location),
  };
}

/**
 * Whether a prefill has every field the checkout form requires, so the customer
 * can skip the details step entirely. contactMethod is optional and excluded.
 * Mirrors Checkout's own isDetailsValid so the client never auto-skips a form the
 * validation would still reject.
 */
export function isCheckoutInfoComplete(info: SavedCheckoutInfo | null): boolean {
  if (!info) return false;

  const required: Array<keyof SavedCheckoutInfo> = [
    'fullName',
    'email',
    'phone',
    'address',
    'barangay',
    'city',
    'state',
    'zipCode',
    'selectedCourierId',
    'shippingLocation',
  ];

  return required.every((field) => coalesce(info[field]).trim() !== '');
}
