import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAccess } from './useAccess';

// Public access verification now goes through the get_access_grant RPC, which
// returns the gate status PLUS the categories the member's approved tier unlocks.
const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function grant(overrides: Record<string, unknown>) {
  return {
    data: {
      status: 'none',
      tier_name: null,
      is_all_access: false,
      category_ids: [],
      ...overrides,
    },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockRpc.mockResolvedValue(grant({ status: 'none' }));
});

describe('useAccess', () => {
  it('starts unverified with no cached email', async () => {
    const { result } = renderHook(() => useAccess());

    await waitFor(() => expect(result.current.checking).toBe(false));

    expect(result.current.isVerified).toBe(false);
    expect(result.current.canAccessCategory('cat-1')).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('verifies an all-access email via the RPC and caches it', async () => {
    mockRpc.mockResolvedValue(
      grant({ status: 'approved', tier_name: 'All Access', is_all_access: true, category_ids: null }),
    );

    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    let outcome: { ok: boolean; status: string } | undefined;
    await act(async () => {
      outcome = await result.current.verifyEmail('Member@Example.com');
    });

    expect(outcome).toMatchObject({ ok: true, status: 'approved' });
    expect(mockRpc).toHaveBeenCalledWith('get_access_grant', { p_email: 'member@example.com' });
    expect(result.current.isVerified).toBe(true);
    expect(result.current.hasAllAccess).toBe(true);
    expect(result.current.canAccessCategory('any-category')).toBe(true);
    expect(localStorage.getItem('pp_access_email')).toBe('member@example.com');
  });

  it('limits a tiered member to their tier categories', async () => {
    mockRpc.mockResolvedValue(
      grant({
        status: 'approved',
        tier_name: 'Weight Management',
        is_all_access: false,
        category_ids: ['cat-weight', 'cat-glp1'],
      }),
    );

    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    await act(async () => {
      await result.current.verifyEmail('bob@example.com');
    });

    expect(result.current.isVerified).toBe(true);
    expect(result.current.hasAllAccess).toBe(false);
    expect(result.current.tierName).toBe('Weight Management');
    expect(result.current.canAccessCategory('cat-weight')).toBe(true);
    expect(result.current.canAccessCategory('cat-glp1')).toBe(true);
    expect(result.current.canAccessCategory('cat-skin')).toBe(false);
    expect(result.current.canAccessCategory(null)).toBe(false);
  });

  it('reports pending without verifying', async () => {
    mockRpc.mockResolvedValue(grant({ status: 'pending' }));

    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    let outcome: { ok: boolean; status: string } | undefined;
    await act(async () => {
      outcome = await result.current.verifyEmail('member@example.com');
    });

    expect(outcome).toMatchObject({ ok: false, status: 'pending' });
    expect(result.current.isVerified).toBe(false);
  });

  it('rejects an invalid email without calling the RPC', async () => {
    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    let outcome: { ok: boolean; status: string } | undefined;
    await act(async () => {
      outcome = await result.current.verifyEmail('not-an-email');
    });

    expect(outcome).toMatchObject({ ok: false, status: 'none' });
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

    expect(outcome).toMatchObject({ ok: false, status: 'none' });
    expect(result.current.isVerified).toBe(false);
  });

  it('re-validates a cached email on mount and clears it if no longer approved', async () => {
    localStorage.setItem('pp_access_email', 'stale@example.com');
    mockRpc.mockResolvedValue(grant({ status: 'none' }));

    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    expect(result.current.isVerified).toBe(false);
    expect(localStorage.getItem('pp_access_email')).toBeNull();
  });

  it('reports renew for a member approved on a prior batch but not the open one', async () => {
    mockRpc.mockResolvedValue(grant({ status: 'renew' }));

    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    let outcome: { ok: boolean; status: string } | undefined;
    await act(async () => {
      outcome = await result.current.verifyEmail('member@example.com');
    });

    expect(outcome).toMatchObject({ ok: false, status: 'renew' });
    expect(result.current.isVerified).toBe(false);
    expect(result.current.needsRenewal).toBe(true);
    expect(result.current.renewalEmail).toBe('member@example.com');
  });

  it('clears a stale cached email when a new batch needs renewal and surfaces it', async () => {
    localStorage.setItem('pp_access_email', 'returning@example.com');
    mockRpc.mockResolvedValue(grant({ status: 'renew' }));

    const { result } = renderHook(() => useAccess());
    await waitFor(() => expect(result.current.checking).toBe(false));

    expect(result.current.isVerified).toBe(false);
    expect(localStorage.getItem('pp_access_email')).toBeNull();
    expect(result.current.needsRenewal).toBe(true);
    expect(result.current.renewalEmail).toBe('returning@example.com');
  });
});
