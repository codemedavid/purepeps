import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ACCESS_EMAIL_KEY, isValidEmail, type AccessGateStatus } from '../utils/access';

export interface VerifyResult {
  ok: boolean;
  status: AccessGateStatus;
}

/**
 * Group-buy access gate. Access is per-batch: a member is "verified" only while
 * an admin-approved request exists for the CURRENTLY-OPEN batch. The verified
 * email is cached in localStorage so checkout stays unlocked across visits, but
 * verification is always re-checked against Supabase — so when a new batch opens
 * the cached email resolves to 'renew' and the stale cache is cleared
 * automatically (no client-side batch tracking needed).
 */
export function useAccess() {
  const [email, setEmail] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [checking, setChecking] = useState(true);
  // Email approved on a prior batch but not the open one — drives the renewal prompt.
  const [renewalEmail, setRenewalEmail] = useState<string | null>(null);

  const lookup = useCallback(async (candidate: string): Promise<VerifyResult> => {
    const normalized = candidate.trim().toLowerCase();
    if (!isValidEmail(normalized)) return { ok: false, status: 'none' };

    // Privacy-preserving: the anon role can no longer SELECT access_requests
    // (that leaked every member's email + payment proof). get_access_status is a
    // SECURITY DEFINER RPC that returns only this email's decisive status for the
    // open batch: 'approved' | 'pending' | 'renew' | 'none'.
    const { data, error } = await supabase.rpc('get_access_status', { p_email: normalized });

    if (error) {
      console.error('Error checking access:', error);
      return { ok: false, status: 'none' };
    }

    if (data === 'approved') return { ok: true, status: 'approved' };
    if (data === 'pending') return { ok: false, status: 'pending' };
    if (data === 'renew') return { ok: false, status: 'renew' };
    return { ok: false, status: 'none' };
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
        setIsVerified(true);
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
        setIsVerified(true);
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
    setIsVerified(false);
    setRenewalEmail(null);
  }, []);

  return {
    email,
    isVerified,
    checking,
    verifyEmail,
    signOut,
    /** Set when a returning member is approved on a prior batch but not the open one. */
    needsRenewal: renewalEmail !== null,
    renewalEmail,
  };
}
