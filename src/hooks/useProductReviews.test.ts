import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProductReviews } from './useProductReviews';
import type { PublicReview } from '../utils/reviews';

// The public page reaches reviews ONLY through get_approved_reviews. anon holds
// no grant on product_reviews, so a .from() here would fail in production.
const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function row(overrides: Partial<PublicReview> = {}): PublicReview {
  return {
    id: 'rev-1',
    product_id: 'prod-1',
    product_name: 'BPC-157',
    variation_name: '10mg',
    display_name: 'Sakura22',
    rating: 5,
    body: 'Sealed and well packed.',
    media_urls: [],
    admin_reply: null,
    admin_replied_at: null,
    created_at: '2026-08-14T02:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useProductReviews', () => {
  it('reads through the RPC, never the table', async () => {
    mockRpc.mockResolvedValue({ data: [row()], error: null });

    const { result } = renderHook(() => useProductReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith('get_approved_reviews', { p_product_id: null });
    expect(result.current.reviews).toHaveLength(1);
  });

  it('narrows to one product when given an id', async () => {
    mockRpc.mockResolvedValue({ data: [row()], error: null });

    const { result } = renderHook(() => useProductReviews('prod-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith('get_approved_reviews', { p_product_id: 'prod-1' });
  });

  it('reports an empty list rather than throwing when there are no reviews', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useProductReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.reviews).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces a readable error and empties the list when the read fails', async () => {
    // Showing a stale list under an error message would imply these are all the
    // reviews there are, which is exactly what is not known.
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc down' } });

    const { result } = renderHook(() => useProductReviews());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.reviews).toEqual([]);
  });

  it('refetches when the product it was asked about changes', async () => {
    mockRpc.mockResolvedValue({ data: [row()], error: null });

    const { result, rerender } = renderHook(({ id }) => useProductReviews(id), {
      initialProps: { id: 'prod-1' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ id: 'prod-2' });
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('get_approved_reviews', { p_product_id: 'prod-2' }),
    );
  });

  it('does not refetch on every render when nothing changed', async () => {
    mockRpc.mockResolvedValue({ data: [row()], error: null });

    const { result, rerender } = renderHook(() => useProductReviews('prod-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender();
    rerender();

    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
