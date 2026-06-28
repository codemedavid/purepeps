// Pure Peps — paid group-buy access constants and helpers.

/**
 * Fallback access fee in Philippine Peso, used only until the open batch's
 * admin-set fee loads (get_active_access_info). Access is now per-batch: each
 * new group buy requires its own paid request + approval.
 */
export const ACCESS_FEE_PHP = 250;

/** localStorage key holding the verified member email (set after admin approval). */
export const ACCESS_EMAIL_KEY = 'pp_access_email';

/**
 * localStorage key holding an email that has PAID but is still awaiting approval.
 * Set when a member submits an access request so the storefront can auto-resolve
 * it to 'approved' in the background (mount + focus + poll) and unlock checkout
 * immediately, without the member manually re-entering their email to verify.
 */
export const PENDING_ACCESS_EMAIL_KEY = 'pp_pending_email';

/** How often to re-check a pending email's approval status while it's unresolved. */
export const ACCESS_POLL_INTERVAL_MS = 10_000;

/** Persisted status of an individual access request row. */
export type AccessStatus = 'pending' | 'approved' | 'rejected';

/**
 * Decisive access state for a member on the CURRENTLY-OPEN batch, returned by
 * the get_access_status RPC:
 *   approved — unlocked for the open batch
 *   pending  — paid for the open batch, awaiting admin review
 *   renew    — approved on a PRIOR batch, but must pay again for the open one
 *   none     — never approved (or rejected on the open batch)
 */
export type AccessGateStatus = 'approved' | 'pending' | 'renew' | 'none';

/** Open batch number + access fee for the storefront (get_active_access_info). */
export interface ActiveAccessInfo {
  batchNumber: number | null;
  accessFee: number | null;
  name: string | null;
}

/**
 * A purchasable access tier. Members pick ONE tier per batch; it grants the
 * categories in `categoryIds` at `price`. `isAllAccess` tiers grant every
 * category and carry `categoryIds: null` (so new categories are auto-included).
 */
export interface Tier {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isAllAccess: boolean;
  /** null = all categories (all-access tier); otherwise the unlocked category ids. */
  categoryIds: string[] | null;
}

/**
 * Resolved access grant for a member on the OPEN batch (get_access_grant RPC):
 * the gate status plus which categories the member's approved tier unlocks.
 */
export interface AccessGrant {
  status: AccessGateStatus;
  tierName: string | null;
  isAllAccess: boolean;
  /** Categories the member may check out. Empty unless status === 'approved'. */
  categoryIds: string[];
}

export interface AccessRequest {
  id: string;
  email: string;
  payment_method_id: string | null;
  payment_method_name: string | null;
  payment_proof_url: string | null;
  amount: number;
  status: AccessStatus;
  notes: string | null;
  group_buy_batch_id: string | null;
  /** The tier this paid request buys. */
  tier_id: string | null;
  /** Tier name — populated by the admin fetch join, not a column. */
  tier_name?: string | null;
  /** Batch number for the request's batch — populated by the admin fetch join, not a column. */
  batch_number?: number | null;
  created_at: string;
  updated_at: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * What to do with a remembered pending email after re-checking its grant status:
 *   promote — now approved: cache it as the verified member, stop watching
 *   keep    — still awaiting admin review: keep watching
 *   renew   — approved on a prior batch only: hand off to the renewal prompt
 *   clear   — rejected or unknown: forget it, stop watching
 */
export type PendingResolution = 'promote' | 'keep' | 'renew' | 'clear';

export function resolvePendingStatus(status: AccessGateStatus): PendingResolution {
  switch (status) {
    case 'approved':
      return 'promote';
    case 'pending':
      return 'keep';
    case 'renew':
      return 'renew';
    default:
      return 'clear';
  }
}
