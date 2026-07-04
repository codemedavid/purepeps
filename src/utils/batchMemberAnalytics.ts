import type { AccessRequest } from './access';
import type { BatchOrder } from '../types';

/**
 * Pure, side-effect-free selectors for the Group Buy admin "members" tab. Kept
 * out of React so the roster de-duplication and buyer-leaderboard math can be
 * unit tested without Supabase. The database stays the source of truth; these
 * helpers only shape already-fetched data for display.
 */

const CANCELLED = 'cancelled';
const APPROVED = 'approved';

/** Case-insensitive email key so `Alice@X.com` and `alice@x.com` count as one person. */
const emailKey = (email: string): string => email.trim().toLowerCase();

/** Latest of two requests by creation time (ISO strings sort lexicographically). */
const isNewer = (a: AccessRequest, b: AccessRequest): boolean => a.created_at > b.created_at;

/**
 * Collapse a batch roster to one row per unique email. When an email has several
 * requests we keep a single representative: prefer an approved (unlocked) request
 * over a pending one, and within that preference keep the most recent. This gives
 * the admin a clean, de-duplicated member list where the count reflects real people.
 */
export function uniqueMembersByEmail(members: AccessRequest[]): AccessRequest[] {
  const byEmail = new Map<string, AccessRequest>();

  for (const member of members) {
    const key = emailKey(member.email);
    const current = byEmail.get(key);
    if (!current) {
      byEmail.set(key, member);
      continue;
    }
    byEmail.set(key, preferred(current, member));
  }

  return [...byEmail.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Pick the representative row: unlocked beats pending, newer beats older within a status. */
function preferred(a: AccessRequest, b: AccessRequest): AccessRequest {
  const aApproved = a.status === APPROVED;
  const bApproved = b.status === APPROVED;
  if (aApproved !== bApproved) return aApproved ? a : b;
  return isNewer(b, a) ? b : a;
}

export interface BuyerSpend {
  /** Lower-cased email used as the grouping key and shown to the admin. */
  email: string;
  /** A human name for the buyer, taken from their first non-empty order name. */
  name: string;
  /** Sum of total_price across the buyer's non-cancelled orders. */
  totalSpend: number;
  /** Number of non-cancelled orders the buyer placed. */
  orderCount: number;
}

/** Default number of buyers shown in the leaderboard. */
export const TOP_BUYERS_LIMIT = 5;

/**
 * Rank buyers by total product spend within a batch, grouped by email. Cancelled
 * orders are excluded so the leaderboard reflects real, committed spend. Sorted by
 * spend (desc), then order count (desc), then email — deterministic on ties.
 */
export function topBuyersByEmail(
  orders: BatchOrder[],
  limit: number = TOP_BUYERS_LIMIT,
): BuyerSpend[] {
  const byEmail = new Map<string, BuyerSpend>();

  for (const order of orders) {
    if (order.order_status === CANCELLED) continue;
    const key = emailKey(order.customer_email);
    if (!key) continue;
    const spend = order.total_price ?? 0;
    const prev = byEmail.get(key);
    byEmail.set(key, {
      email: key,
      name: prev?.name || order.customer_name || key,
      totalSpend: (prev?.totalSpend ?? 0) + spend,
      orderCount: (prev?.orderCount ?? 0) + 1,
    });
  }

  return [...byEmail.values()]
    .sort(
      (a, b) =>
        b.totalSpend - a.totalSpend ||
        b.orderCount - a.orderCount ||
        a.email.localeCompare(b.email),
    )
    .slice(0, limit);
}
