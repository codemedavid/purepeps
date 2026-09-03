import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAdminReviews } from './useAdminReviews';
import type { AdminReview } from '../utils/reviews';

// Admins reach product_reviews directly: RLS confines the table to is_admin(),
// and there is no moderation RPC. Every write therefore goes through .from().
const mockFrom = vi.fn();
const mockGetUser = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: () => mockGetUser() },
  },
}));

function review(overrides: Partial<AdminReview> = {}): AdminReview {
  return {
    id: 'rev-1',
    order_id: 'order-1',
    order_number: 'PP-1042',
    product_id: 'prod-1',
    product_name: 'BPC-157',
    variation_name: '10mg',
    reviewer_name: 'Maria Santos',
    reviewer_email: 'maria@example.com',
    reviewer_phone: '09171234567',
    display_name: 'Sakura22',
    rating: 5,
    body: 'Sealed and well packed.',
    media_urls: [],
    status: 'pending',
    admin_reply: null,
    admin_replied_at: null,
    moderated_at: null,
    moderated_by: null,
    created_at: '2026-08-14T02:00:00Z',
    updated_at: '2026-08-14T02:00:00Z',
    ...overrides,
  };
}

/** Chainable read whose terminal .order() resolves to the given rows. */
function readReturning(rows: AdminReview[] | null, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error }),
  };
}

/** Captures an update: `.update(payload).eq('id', x)`. */
function updateCapturing(capture: { payload?: Record<string, unknown>; id?: string }) {
  return {
    update: vi.fn((payload: Record<string, unknown>) => {
      capture.payload = payload;
      return {
        eq: vi.fn((_column: string, value: string) => {
          capture.id = value;
          return Promise.resolve({ error: null });
        }),
      };
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-uuid' } } });
});

describe('useAdminReviews — reading', () => {
  it('loads every review, newest first, with reviewer identity intact', async () => {
    // The admin queue is the ONE place identity is meant to be visible: it is
    // how a reviewer is verified against their order before approval.
    const read = readReturning([review()]);
    mockFrom.mockReturnValue(read);

    const { result } = renderHook(() => useAdminReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFrom).toHaveBeenCalledWith('product_reviews');
    expect(read.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result.current.reviews[0].reviewer_email).toBe('maria@example.com');
  });

  it('surfaces a readable error and empties the queue when the read fails', async () => {
    mockFrom.mockReturnValue(readReturning(null, { message: 'denied' }));

    const { result } = renderHook(() => useAdminReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.reviews).toEqual([]);
  });
});

describe('useAdminReviews — moderating', () => {
  it('stamps who moderated and when, not just the new status', async () => {
    // Without these the queue cannot answer "who approved this, and when",
    // which is the only record that a human vetted the purchase.
    const capture: { payload?: Record<string, unknown>; id?: string } = {};
    mockFrom
      .mockReturnValueOnce(readReturning([review()]))
      .mockReturnValueOnce(updateCapturing(capture))
      .mockReturnValue(readReturning([review({ status: 'approved' })]));

    const { result } = renderHook(() => useAdminReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setStatus('rev-1', 'approved');
    });

    expect(capture.id).toBe('rev-1');
    expect(capture.payload).toMatchObject({ status: 'approved', moderated_by: 'admin-uuid' });
    expect(capture.payload?.moderated_at).toEqual(expect.any(String));
  });

  it('carries the same stamp through reject and hide', async () => {
    const capture: { payload?: Record<string, unknown>; id?: string } = {};
    mockFrom
      .mockReturnValueOnce(readReturning([review()]))
      .mockReturnValueOnce(updateCapturing(capture))
      .mockReturnValue(readReturning([]));

    const { result } = renderHook(() => useAdminReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setStatus('rev-1', 'hidden');
    });

    expect(capture.payload).toMatchObject({ status: 'hidden', moderated_by: 'admin-uuid' });
  });

  it('still moderates when the admin identity cannot be read', async () => {
    // A lost session lookup must not block moderation; the stamp degrades to
    // null rather than the action failing.
    mockGetUser.mockRejectedValue(new Error('no session'));
    const capture: { payload?: Record<string, unknown>; id?: string } = {};
    mockFrom
      .mockReturnValueOnce(readReturning([review()]))
      .mockReturnValueOnce(updateCapturing(capture))
      .mockReturnValue(readReturning([]));

    const { result } = renderHook(() => useAdminReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setStatus('rev-1', 'approved');
    });

    expect(capture.payload).toMatchObject({ status: 'approved', moderated_by: null });
  });

  it('records a reply with its timestamp without changing the status', async () => {
    // Replying to a pending review must not publish it by accident.
    const capture: { payload?: Record<string, unknown>; id?: string } = {};
    mockFrom
      .mockReturnValueOnce(readReturning([review()]))
      .mockReturnValueOnce(updateCapturing(capture))
      .mockReturnValue(readReturning([]));

    const { result } = renderHook(() => useAdminReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reply('rev-1', 'Thanks for the kind words!');
    });

    expect(capture.payload).toMatchObject({ admin_reply: 'Thanks for the kind words!' });
    expect(capture.payload?.admin_replied_at).toEqual(expect.any(String));
    expect(capture.payload).not.toHaveProperty('status');
  });

  it('clears a reply back to null rather than storing an empty string', async () => {
    const capture: { payload?: Record<string, unknown>; id?: string } = {};
    mockFrom
      .mockReturnValueOnce(readReturning([review()]))
      .mockReturnValueOnce(updateCapturing(capture))
      .mockReturnValue(readReturning([]));

    const { result } = renderHook(() => useAdminReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reply('rev-1', '   ');
    });

    expect(capture.payload).toMatchObject({ admin_reply: null, admin_replied_at: null });
  });

  it('deletes a review by id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    mockFrom
      .mockReturnValueOnce(readReturning([review()]))
      .mockReturnValueOnce({ delete: vi.fn(() => ({ eq })) })
      .mockReturnValue(readReturning([]));

    const { result } = renderHook(() => useAdminReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('rev-1');
    });

    expect(eq).toHaveBeenCalledWith('id', 'rev-1');
  });

  it('propagates a write failure instead of reporting success', async () => {
    mockFrom.mockReturnValueOnce(readReturning([review()])).mockReturnValueOnce({
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: { message: 'denied' } }) })),
    });

    const { result } = renderHook(() => useAdminReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.setStatus('rev-1', 'approved')).rejects.toThrow();
  });

  it('refetches after a successful write so the queue reflects the change', async () => {
    const capture: { payload?: Record<string, unknown>; id?: string } = {};
    mockFrom
      .mockReturnValueOnce(readReturning([review()]))
      .mockReturnValueOnce(updateCapturing(capture))
      .mockReturnValue(readReturning([review({ status: 'approved' })]));

    const { result } = renderHook(() => useAdminReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setStatus('rev-1', 'approved');
    });

    await waitFor(() => expect(result.current.reviews[0].status).toBe('approved'));
  });
});
