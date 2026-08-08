import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useStorefrontNotice } from './useStorefrontNotice';
import { DEFAULT_STOREFRONT_NOTICE, STOREFRONT_NOTICE_KEYS } from '../utils/storefrontNotice';

const mockIn = vi.fn();
const mockUpsert = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ in: (column: string, values: string[]) => mockIn(table, column, values) }),
      upsert: (rows: unknown) => mockUpsert(table, rows),
    }),
  },
}));

describe('useStorefrontNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIn.mockResolvedValue({ data: [], error: null });
    mockUpsert.mockResolvedValue({ error: null });
  });

  it('reads only the notice keys from site_settings', async () => {
    renderHook(() => useStorefrontNotice());

    await waitFor(() => expect(mockIn).toHaveBeenCalled());
    expect(mockIn).toHaveBeenCalledWith('site_settings', 'id', [...STOREFRONT_NOTICE_KEYS]);
  });

  it('starts in a loading state and resolves to the stored notice', async () => {
    mockIn.mockResolvedValue({
      data: [{ id: 'storefront_notice_title', value: 'Heads Up' }],
      error: null,
    });

    const { result } = renderHook(() => useStorefrontNotice());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notice.title).toBe('Heads Up');
    expect(result.current.error).toBeNull();
  });

  it('falls back to the defaults when the query fails', async () => {
    mockIn.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const { result } = renderHook(() => useStorefrontNotice());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notice).toEqual(DEFAULT_STOREFRONT_NOTICE);
    expect(result.current.error).toBe('boom');
  });

  it('falls back to the defaults when the query throws', async () => {
    mockIn.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useStorefrontNotice());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notice).toEqual(DEFAULT_STOREFRONT_NOTICE);
    expect(result.current.error).toBe('network down');
  });

  it('upserts every notice key on save', async () => {
    const { result } = renderHook(() => useStorefrontNotice());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveNotice({ ...DEFAULT_STOREFRONT_NOTICE, title: 'Heads Up' });
    });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const [table, rows] = mockUpsert.mock.calls[0];
    expect(table).toBe('site_settings');
    expect(rows).toHaveLength(STOREFRONT_NOTICE_KEYS.length);
    expect(rows).toContainEqual(expect.objectContaining({ id: 'storefront_notice_title', value: 'Heads Up' }));
  });

  it('exposes the saved notice without a refetch', async () => {
    const { result } = renderHook(() => useStorefrontNotice());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveNotice({ ...DEFAULT_STOREFRONT_NOTICE, title: 'Heads Up' });
    });

    expect(result.current.notice.title).toBe('Heads Up');
  });

  it('rejects and surfaces an error when the save fails', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'denied' } });

    const { result } = renderHook(() => useStorefrontNotice());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let caught: unknown = null;
    await act(async () => {
      await result.current.saveNotice(DEFAULT_STOREFRONT_NOTICE).catch((err) => {
        caught = err;
      });
    });

    expect((caught as Error | null)?.message).toBe('denied');
    expect(result.current.error).toBe('denied');
  });
});
