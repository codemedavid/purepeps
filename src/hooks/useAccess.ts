import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  ACCESS_EMAIL_KEY,
  isValidEmail,
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
 */
export function useAccess() {
  const [email, setEmail] = useState<string | null>(null);
  const [grant, setGrant] = useState<AccessGrant>(EMPTY_GRANT);
  const [checking, setChecking] = useState(true);
  // Email approved on a prior batch but not the open one — drives the renewal prompt.
  const [renewalEmail, setRenewalEmail] = useState<string | null>(null);

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

  // Re-validate any cached email on mount.
  useEffect(() => {
    const cached = localStorage.getItem(ACCESS_EMAIL_KEY);
    if (!cached) {
      setChecking(false);
      return;
    }

    let active = true;
    lookup(cached).then((result) => {
      if (!active) return;
      if (result.ok) {
        setEmail(cached);
        setGrant(result.grant);
      } else {
        // Cached email no longer unlocks the open batch. If it was approved on a
        // prior batch, remember it so the storefront can offer a renewal.
        if (result.status === 'renew') setRenewalEmail(cached.trim().toLowerCase());
        localStorage.removeItem(ACCESS_EMAIL_KEY);
      }
      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, [lookup]);

  /** Check an email and, if approved, persist it as the verified member. */
  const verifyEmail = useCallback(
    async (candidate: string): Promise<VerifyResult> => {
      const result = await lookup(candidate);
      const normalized = candidate.trim().toLowerCase();
      if (result.ok) {
        localStorage.setItem(ACCESS_EMAIL_KEY, normalized);
        setEmail(normalized);
        setGrant(result.grant);
        setRenewalEmail(null);
      } else if (result.status === 'renew') {
        setRenewalEmail(normalized);
      }
      return result;
    },
    [lookup],
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(ACCESS_EMAIL_KEY);
    setEmail(null);
    setGrant(EMPTY_GRANT);
    setRenewalEmail(null);
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
