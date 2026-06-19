import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface AdminSignInResult {
  success: boolean;
  error?: string;
}

export interface AdminAuth {
  /** Current Supabase Auth session, or null when signed out. */
  session: Session | null;
  /** True only when the session belongs to a user listed in admin_users. */
  isAdmin: boolean;
  /** True while the initial session + admin check is resolving. */
  loading: boolean;
  /** Last sign-in error message, surfaced by the login form. */
  error: string | null;
  signIn: (email: string, password: string) => Promise<AdminSignInResult>;
  signOut: () => Promise<void>;
}

/** Generic message — never reveal whether the email or password was the wrong one. */
const INVALID_CREDENTIALS = 'Invalid email or password.';
const NOT_AUTHORIZED = 'This account is not authorized for admin access.';

/**
 * Admin authentication backed by Supabase Auth. A session alone is not enough:
 * the user must also be an admin (checked server-side via the is_admin() RPC,
 * which reads admin_users). This is the client-side mirror of the RLS rules —
 * the database independently enforces admin-only writes, so a tampered client
 * cannot escalate.
 */
export function useAdminAuth(): AdminAuth {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAdmin = useCallback(async (current: Session | null): Promise<boolean> => {
    if (!current) return false;
    try {
      const { data, error: rpcError } = await supabase.rpc('is_admin');
      if (rpcError) {
        console.error('Admin check failed:', rpcError);
        return false;
      }
      return data === true;
    } catch (err) {
      console.error('Admin check threw:', err);
      return false;
    }
  }, []);

  // Resolve the initial session and subscribe to auth changes (login/logout,
  // token refresh, cross-tab sign-out).
  useEffect(() => {
    let active = true;

    const resolve = async (current: Session | null) => {
      const admin = await checkAdmin(current);
      if (!active) return;
      setSession(current);
      setIsAdmin(admin);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => resolve(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, current) => {
      resolve(current);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [checkAdmin]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AdminSignInResult> => {
      setError(null);
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setError(INVALID_CREDENTIALS);
        return { success: false, error: INVALID_CREDENTIALS };
      }

      // Authenticated, but is this user actually an admin? If not, refuse and
      // tear the session down so a non-admin login leaves nothing behind.
      const admin = await checkAdmin(data.session);
      if (!admin) {
        await supabase.auth.signOut();
        setSession(null);
        setIsAdmin(false);
        setError(NOT_AUTHORIZED);
        return { success: false, error: NOT_AUTHORIZED };
      }

      return { success: true };
    },
    [checkAdmin],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(false);
  }, []);

  return { session, isAdmin, loading, error, signIn, signOut };
}
