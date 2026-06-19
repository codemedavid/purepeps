import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAccess } from './useAccess';

// Public access verification now goes through the get_access_status RPC instead
// of a direct (PII-leaking) select on access_requests.
const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockRpc.mockResolvedValue({ data: 'none', error: null });
});

describe('useAccess', () => {
  it('starts unverified with no cached email', async () => {
    const { result } = renderHook(() => useAccess());

    await waitFor(() => expect(result.current.checking).toBe(false));

    expect(result.current.isVerified).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('verifies an approved email via the RPC and caches it', async () => {
    mockRpc.mockResolvedValue({ data: 'approved', error: null });

    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    let outcome: { ok: boolean; status: string } | undefined;
    await act(async () => {
      outcome = await result.current.verifyEmail('Member@Example.com');
    });

    expect(outcome).toEqual({ ok: true, status: 'approved' });
    expect(mockRpc).toHaveBeenCalledWith('get_access_status', { p_email: 'member@example.com' });
    expect(result.current.isVerified).toBe(true);
    expect(localStorage.getItem('pp_access_email')).toBe('member@example.com');
  });

  it('reports pending without verifying', async () => {
    mockRpc.mockResolvedValue({ data: 'pending', error: null });

    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    let outcome: { ok: boolean; status: string } | undefined;
    await act(async () => {
      outcome = await result.current.verifyEmail('member@example.com');
    });

    expect(outcome).toEqual({ ok: false, status: 'pending' });
    expect(result.current.isVerified).toBe(false);
  });

  it('rejects an invalid email without calling the RPC', async () => {
    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    let outcome: { ok: boolean; status: string } | undefined;
    await act(async () => {
      outcome = await result.current.verifyEmail('not-an-email');
    });

    expect(outcome).toEqual({ ok: false, status: 'none' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('fails closed when the RPC errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('rpc down') });

    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    let outcome: { ok: boolean; status: string } | undefined;
    await act(async () => {
      outcome = await result.current.verifyEmail('member@example.com');
    });

    expect(outcome).toEqual({ ok: false, status: 'none' });
  });

  it('re-validates a cached email on mount and clears it if no longer approved', async () => {
    localStorage.setItem('pp_access_email', 'stale@example.com');
    mockRpc.mockResolvedValue({ data: 'none', error: null });

    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    expect(result.current.isVerified).toBe(false);
    expect(localStorage.getItem('pp_access_email')).toBeNull();
  });
});
