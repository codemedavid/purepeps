import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  ACCESS_EMAIL_KEY,
  ACCESS_POLL_INTERVAL_MS,
  PENDING_ACCESS_EMAIL_KEY,
  isValidEmail,
  resolvePendingStatus,
  type AccessGateStatus,
  type AccessGrant,
} from '../utils/access';

export interface VerifyResult {
  ok: boolean;
  status: AccessGateStatus;
  grant: AccessGrant;
}

const EMPTY_GRANT: AccessGrant = {
  status: 'none',
  tierName: null,
  isAllAccess: false,
  categoryIds: [],
};

interface RawGrant {
  status: AccessGateStatus;
  tier_name: string | null;
  is_all_access: boolean;
  category_ids: string[] | null;
}

function normalizeGrant(raw: RawGrant | null): AccessGrant {
  if (!raw) return EMPTY_GRANT;
  return {
    status: raw.status,
    tierName: raw.tier_name,
    isAllAccess: Boolean(raw.is_all_access),
    categoryIds: raw.category_ids ?? [],
  };
}

/**
 * Group-buy access gate. Access is per-batch AND per-tier: a member is "verified"
 * only while an admin-approved request exists for the CURRENTLY-OPEN batch, and
 * that approval grants a TIER — the set of categories the member may check out.
 * The verified email is cached in localStorage so checkout stays unlocked across
 * visits, but verification is always re-checked against Supabase via the
 * get_access_grant RPC (so a new batch resolves a cached email to 'renew' and
 * clears the stale cache, and a tier's categories stay authoritative).
 *
 * A member who has PAID but isn't approved yet is remembered separately (the
 * pending email). The hook re-checks it in the background — on mount, on tab
 * focus, and via light polling — and the instant it flips to 'approved' it is
 * promoted to the verified cache, unlocking checkout with no manual re-verify.
 */
export function useAccess() {
  const [email, setEmail] = useState<string | null>(null);
  const [grant, setGrant] = useState<AccessGrant>(EMPTY_GRANT);
  const [checking, setChecking] = useState(true);
  // Email approved on a prior batch but not the open one — drives the renewal prompt.
  const [renewalEmail, setRenewalEmail] = useState<string | null>(null);
  // Paid-but-unapproved email being watched for auto-unlock (null once resolved).
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const isVerified = grant.status === 'approved';

  const lookup = useCallback(async (candidate: string): Promise<VerifyResult> => {
    const normalized = candidate.trim().toLowerCase();
    if (!isValidEmail(normalized)) return { ok: false, status: 'none', grant: EMPTY_GRANT };

    // get_access_grant is a SECURITY DEFINER RPC returning this email's decisive
    // status for the open batch plus the categories its approved tier unlocks.
    const { data, error } = await supabase.rpc('get_access_grant', { p_email: normalized });

    if (error) {
      console.error('Error checking access:', error);
      return { ok: false, status: 'none', grant: EMPTY_GRANT };
    }

    const resolved = normalizeGrant((data ?? null) as RawGrant | null);
    return { ok: resolved.status === 'approved', status: resolved.status, grant: resolved };
  }, []);

  /** Cache an approved email as the verified member and stop watching it as pending. */
  const promote = useCallback((normalized: string, nextGrant: AccessGrant) => {
    localStorage.setItem(ACCESS_EMAIL_KEY, normalized);
    localStorage.removeItem(PENDING_ACCESS_EMAIL_KEY);
    setEmail(normalized);
    setGrant(nextGrant);
    setRenewalEmail(null);
    setPendingEmail(null);
  }, []);

  /**
   * Re-check a paid-but-unapproved email and act on the result: promote it once
   * approved, hand off to the renewal prompt, forget it if rejected, or keep
   * watching while still pending.
   */
  const resolvePending = useCallback(
    async (candidate: string): Promise<void> => {
      const normalized = candidate.trim().toLowerCase();
      if (!isValidEmail(normalized)) {
        localStorage.removeItem(PENDING_ACCESS_EMAIL_KEY);
        setPendingEmail(null);
        return;
      }

      const result = await lookup(normalized);
      switch (resolvePendingStatus(result.status)) {
        case 'promote':
          promote(normalized, result.grant);
          break;
        case 'renew':
          localStorage.removeItem(PENDING_ACCESS_EMAIL_KEY);
          setPendingEmail(null);
          setRenewalEmail(normalized);
          break;
        case 'clear':
          localStorage.removeItem(PENDING_ACCESS_EMAIL_KEY);
          setPendingEmail(null);
          break;
        case 'keep':
        default:
          break;
      }
    },
    [lookup, promote],
  );

  // On mount: prefer a cached verified email; otherwise pick up a paid-but-pending
  // email and try to resolve it now (it may already be approved).
  useEffect(() => {
    const cached = localStorage.getItem(ACCESS_EMAIL_KEY);
    const pending = localStorage.getItem(PENDING_ACCESS_EMAIL_KEY);
    let active = true;

    const run = async () => {
      if (cached) {
        const result = await lookup(cached);
        if (!active) return;
        if (result.ok) {
          setEmail(cached);
          setGrant(result.grant);
          setChecking(false);
          return;
        }
        // Cached email no longer unlocks the open batch. If it was approved on a
        // prior batch, remember it so the storefront can offer a renewal.
        if (result.status === 'renew') setRenewalEmail(cached.trim().toLowerCase());
        localStorage.removeItem(ACCESS_EMAIL_KEY);
      }

      if (pending) {
        setPendingEmail(pending.trim().toLowerCase());
        await resolvePending(pending);
      }
      if (active) setChecking(false);
    };

    run();

    return () => {
      active = false;
    };
  }, [lookup, resolvePending]);

  // While a pending email is unresolved, keep checking for approval so checkout
  // unlocks automatically — on tab focus (instant for returning members) and via
  // light polling (for members who keep the page open after paying).
  useEffect(() => {
    if (!pendingEmail || isVerified) return;

    const check = () => {
      void resolvePending(pendingEmail);
    };
    const onFocus = () => {
      if (document.visibilityState === 'visible') check();
    };

    const interval = window.setInterval(check, ACCESS_POLL_INTERVAL_MS);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [pendingEmail, isVerified, resolvePending]);

  /** Check an email and, if approved, persist it as the verified member. */
  const verifyEmail = useCallback(
    async (candidate: string): Promise<VerifyResult> => {
      const result = await lookup(candidate);
      const normalized = candidate.trim().toLowerCase();
      if (result.ok) {
        promote(normalized, result.grant);
      } else if (result.status === 'renew') {
        setRenewalEmail(normalized);
      }
      return result;
    },
    [lookup, promote],
  );

  /**
   * Remember a paid email so its approval auto-unlocks checkout. Called when a
   * member submits an access request, so they never have to manually re-verify.
   */
  const watchPendingEmail = useCallback((candidate: string) => {
    const normalized = candidate.trim().toLowerCase();
    if (!isValidEmail(normalized)) return;
    localStorage.setItem(PENDING_ACCESS_EMAIL_KEY, normalized);
    setPendingEmail(normalized);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(ACCESS_EMAIL_KEY);
    localStorage.removeItem(PENDING_ACCESS_EMAIL_KEY);
    setEmail(null);
    setGrant(EMPTY_GRANT);
    setRenewalEmail(null);
    setPendingEmail(null);
  }, []);

  // Stable lookup set for per-category gating.
  const accessibleCategoryIds = useMemo(
    () => new Set(grant.categoryIds),
    [grant.categoryIds],
  );

  const hasAllAccess = isVerified && grant.isAllAccess;

  /**
   * Whether the verified member may check out products in this category.
   * Unverified members can never check out; all-access members always can.
   */
  const canAccessCategory = useCallback(
    (categoryId: string | null | undefined): boolean => {
      if (!isVerified) return false;
      if (grant.isAllAccess) return true;
      if (!categoryId) return false;
      return accessibleCategoryIds.has(categoryId);
    },
    [isVerified, grant.isAllAccess, accessibleCategoryIds],
  );

  return {
    email,
    isVerified,
    checking,
    verifyEmail,
    /** Remember a just-paid email so its approval auto-unlocks checkout. */
    watchPendingEmail,
    signOut,
    /** The resolved access grant (status + tier + categories). */
    grant,
    /** Tier name the member holds for the open batch, if approved. */
    tierName: grant.tierName,
    hasAllAccess,
    /** Category ids the member may check out (empty if all-access or unverified). */
    accessibleCategoryIds,
    canAccessCategory,
    /** Set when a returning member is approved on a prior batch but not the open one. */
    needsRenewal: renewalEmail !== null,
    renewalEmail,
  };
}
