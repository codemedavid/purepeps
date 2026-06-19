import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ACCESS_EMAIL_KEY, isValidEmail } from '../utils/access';

export interface VerifyResult {
  ok: boolean;
  status: 'approved' | 'pending' | 'none';
}

/**
 * Group-buy access gate. A member is "verified" once an admin approves their
 * access request. The verified email is cached in localStorage so checkout
 * stays unlocked across visits; verification is always re-checked against
 * Supabase so a revoked member loses access.
 */
export function useAccess() {
  const [email, setEmail] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [checking, setChecking] = useState(true);

  const lookup = useCallback(async (candidate: string): Promise<VerifyResult> => {
    const normalized = candidate.trim().toLowerCase();
    if (!isValidEmail(normalized)) return { ok: false, status: 'none' };

    // Privacy-preserving: the anon role can no longer SELECT access_requests
    // (that leaked every member's email + payment proof). get_access_status is a
    // SECURITY DEFINER RPC that returns only this email's decisive status:
    // most-recent approved/rejected wins; else pending; else none.
    const { data, error } = await supabase.rpc('get_access_status', { p_email: normalized });

    if (error) {
      console.error('Error checking access:', error);
      return { ok: false, status: 'none' };
    }

    if (data === 'approved') return { ok: true, status: 'approved' };
    if (data === 'pending') return { ok: false, status: 'pending' };
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
      if (result.ok) {
        const normalized = candidate.trim().toLowerCase();
        localStorage.setItem(ACCESS_EMAIL_KEY, normalized);
        setEmail(normalized);
        setIsVerified(true);
      }
      return result;
    },
    [lookup],
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(ACCESS_EMAIL_KEY);
    setEmail(null);
    setIsVerified(false);
  }, []);

  return { email, isVerified, checking, verifyEmail, signOut };
}
