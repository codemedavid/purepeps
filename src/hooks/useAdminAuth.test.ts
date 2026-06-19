import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAdminAuth } from './useAdminAuth';

// Supabase Auth mock surface.
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockRpc = vi.fn();

// Captured onAuthStateChange callback so tests can simulate auth events.
let authCallback: ((event: string, session: unknown) => void) | null = null;

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => mockOnAuthStateChange(cb),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const FAKE_SESSION = { access_token: 'jwt', user: { id: 'user-1' } };

beforeEach(() => {
  vi.clearAllMocks();
  authCallback = null;
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    authCallback = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  mockSignOut.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: false, error: null });
});

describe('useAdminAuth', () => {
  describe('initial session resolution', () => {
    it('starts unauthenticated when there is no session', async () => {
      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isAdmin).toBe(false);
      expect(result.current.session).toBeNull();
      // No session => never asks the database whether the caller is an admin.
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('recognizes an existing admin session on mount', async () => {
      mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
      mockRpc.mockResolvedValue({ data: true, error: null });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isAdmin).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('is_admin');
    });

    it('treats a logged-in non-admin as not an admin', async () => {
      mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
      mockRpc.mockResolvedValue({ data: false, error: null });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isAdmin).toBe(false);
    });

    it('fails closed when the is_admin check errors', async () => {
      mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
      mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isAdmin).toBe(false);
    });
  });

  describe('signIn', () => {
    it('returns a generic error for invalid credentials', async () => {
      mockSignInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid login credentials' } });

      const { result } = renderHook(() => useAdminAuth());
      await waitFor(() => expect(result.current.loading).toBe(false));

      let outcome: { success: boolean; error?: string } | undefined;
      await act(async () => {
        outcome = await result.current.signIn('admin@example.com', 'wrong');
      });

      expect(outcome?.success).toBe(false);
      expect(outcome?.error).toBe('Invalid email or password.');
      expect(result.current.error).toBe('Invalid email or password.');
    });

    it('rejects an authenticated user who is not an admin and signs them out', async () => {
      mockSignInWithPassword.mockResolvedValue({ data: { session: FAKE_SESSION }, error: null });
      mockRpc.mockResolvedValue({ data: false, error: null });

      const { result } = renderHook(() => useAdminAuth());
      await waitFor(() => expect(result.current.loading).toBe(false));

      let outcome: { success: boolean; error?: string } | undefined;
      await act(async () => {
        outcome = await result.current.signIn('user@example.com', 'correct');
      });

      expect(outcome?.success).toBe(false);
      expect(outcome?.error).toBe('This account is not authorized for admin access.');
      // Critically: a non-admin login must leave no lingering session.
      expect(mockSignOut).toHaveBeenCalled();
      expect(result.current.isAdmin).toBe(false);
    });

    it('lowercases and trims the email before signing in', async () => {
      mockSignInWithPassword.mockResolvedValue({ data: { session: FAKE_SESSION }, error: null });
      mockRpc.mockResolvedValue({ data: true, error: null });

      const { result } = renderHook(() => useAdminAuth());
      await waitFor(() => expect(result.current.loading).toBe(false));

      let outcome: { success: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.signIn('  Admin@Example.com  ', 'correct');
      });

      expect(outcome?.success).toBe(true);
      expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'admin@example.com', password: 'correct' });
    });
  });

  describe('auth state changes', () => {
    it('promotes to admin when an admin signs in via the auth listener', async () => {
      mockRpc.mockResolvedValue({ data: true, error: null });

      const { result } = renderHook(() => useAdminAuth());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isAdmin).toBe(false);

      await act(async () => {
        authCallback?.('SIGNED_IN', FAKE_SESSION);
      });

      await waitFor(() => expect(result.current.isAdmin).toBe(true));
    });

    it('clears admin state on signOut', async () => {
      mockGetSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
      mockRpc.mockResolvedValue({ data: true, error: null });

      const { result } = renderHook(() => useAdminAuth());
      await waitFor(() => expect(result.current.isAdmin).toBe(true));

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSignOut).toHaveBeenCalled();
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.session).toBeNull();
    });
  });
});
