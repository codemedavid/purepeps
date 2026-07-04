// Pure Peps — thin wrappers over the approval-gated member-cart RPCs.
// Kept separate from useCart so the hook's sync logic is testable without a
// live Supabase backend (mock this module) and so the cart UI never imports the
// client directly.

import { supabase } from '../lib/supabase';
import { isValidStoredItem, type StoredCartItem } from './cart';

/**
 * The verified member's stored cart references. Returns an empty list on any
 * error or when the email isn't approved (the RPC itself returns []), so a
 * transient failure never wipes the member's local cart.
 */
export async function fetchMemberCart(email: string): Promise<StoredCartItem[]> {
  const { data, error } = await supabase.rpc('get_member_cart', { p_email: email });
  if (error) {
    console.error('Error loading member cart:', error);
    return [];
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.filter(isValidStoredItem);
}

/** Persist the verified member's cart references. Errors are logged, not thrown. */
export async function persistMemberCart(email: string, items: StoredCartItem[]): Promise<void> {
  const { error } = await supabase.rpc('save_member_cart', { p_email: email, p_items: items });
  if (error) {
    console.error('Error saving member cart:', error);
  }
}
