import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAccessRequests } from './useAccessRequests';

// useAccessRequests talks to two Supabase surfaces:
//   * supabase.from('access_requests')… for the admin fetch (fetchAll)
//   * supabase.functions.invoke('approve-access', …) for every status/tier write
// so both are mocked here.
const mockInvoke = vi.fn();
const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

const BASE_ROW = {
  id: 'req-1',
  email: 'member@example.com',
  payment_method_id: null,
  payment_method_name: 'GCash',
  payment_proof_url: null,
  amount: 300,
  status: 'approved' as const,
  notes: null,
  group_buy_batch_id: 'batch-1',
  tier_id: 'tier-200',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

/** Builds the chainable query returned by supabase.from(...), resolving to `rows`. */
function fromReturning(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue(
    fromReturning([
      {
        ...BASE_ROW,
        group_buy_batches: { batch_number: 1 },
        tiers: { name: '200 Access' },
      },
    ]),
  );
});

describe('useAccessRequests.setTier', () => {
  it('invokes approve-access with the target tier_id', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: true, data: { ...BASE_ROW, tier_id: 'tier-300' } },
      error: null,
    });

    const { result } = renderHook(() => useAccessRequests());
    await act(async () => {
      await result.current.fetchAll();
    });
    await waitFor(() => expect(result.current.requests).toHaveLength(1));

    await act(async () => {
      await result.current.setTier('req-1', 'tier-300', '300 Access');
    });

    expect(mockInvoke).toHaveBeenCalledWith('approve-access', {
      body: { id: 'req-1', tier_id: 'tier-300' },
    });
  });

  it('patches the local row tier immutably on success', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: true, data: { ...BASE_ROW, tier_id: 'tier-300' } },
      error: null,
    });

    const { result } = renderHook(() => useAccessRequests());
    await act(async () => {
      await result.current.fetchAll();
    });
    await waitFor(() => expect(result.current.requests).toHaveLength(1));
    const before = result.current.requests[0];

    let outcome: { success: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.setTier('req-1', 'tier-300', '300 Access');
    });

    expect(outcome).toMatchObject({ success: true });
    const after = result.current.requests[0];
    expect(after.tier_id).toBe('tier-300');
    expect(after.tier_name).toBe('300 Access');
    expect(after).not.toBe(before); // new object, no mutation
  });

  it('returns an error and leaves state unchanged when the function fails', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: false, error: 'Tier not offered on this batch' },
      error: null,
    });

    const { result } = renderHook(() => useAccessRequests());
    await act(async () => {
      await result.current.fetchAll();
    });
    await waitFor(() => expect(result.current.requests).toHaveLength(1));

    let outcome: { success: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.setTier('req-1', 'tier-300', '300 Access');
    });

    expect(outcome).toMatchObject({ success: false, error: 'Tier not offered on this batch' });
    expect(result.current.requests[0].tier_id).toBe('tier-200');
  });
});
