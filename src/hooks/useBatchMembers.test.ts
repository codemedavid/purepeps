import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBatchMembers } from './useBatchMembers';

const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// Records the filters the hook applies so we can assert it scopes to the batch
// and to subscriber statuses (approved + pending).
let capturedEq: [string, unknown][] = [];
let capturedIn: [string, unknown[]] | null = null;

function fromReturning(rows: unknown[]) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => {
      capturedEq.push([col, val]);
      return query;
    }),
    in: vi.fn((col: string, vals: unknown[]) => {
      capturedIn = [col, vals];
      return query;
    }),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return query;
}

const ROWS = [
  {
    id: 'req-1',
    email: 'a@example.com',
    amount: 300,
    status: 'approved',
    group_buy_batch_id: 'batch-1',
    tier_id: 'tier-300',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    tiers: { name: '300 Access' },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  capturedEq = [];
  capturedIn = null;
  mockFrom.mockReturnValue(fromReturning(ROWS));
});

describe('useBatchMembers', () => {
  it('does not query when no batch id is provided', async () => {
    const { result } = renderHook(() => useBatchMembers(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.members).toEqual([]);
  });

  it('loads approved and pending members scoped to the batch', async () => {
    const { result } = renderHook(() => useBatchMembers('batch-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFrom).toHaveBeenCalledWith('access_requests');
    expect(capturedEq).toContainEqual(['group_buy_batch_id', 'batch-1']);
    expect(capturedIn).toEqual(['status', ['approved', 'pending']]);
    expect(result.current.members).toHaveLength(1);
    expect(result.current.members[0].tier_name).toBe('300 Access');
  });

  it('surfaces an error when the query fails', async () => {
    const failing = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: new Error('boom') }),
    };
    mockFrom.mockReturnValue(failing);

    const { result } = renderHook(() => useBatchMembers('batch-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.members).toEqual([]);
  });

  it('reloads on demand', async () => {
    const { result } = renderHook(() => useBatchMembers('batch-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mockFrom.mockClear();

    await act(async () => {
      await result.current.reload();
    });
    expect(mockFrom).toHaveBeenCalledWith('access_requests');
  });
});
