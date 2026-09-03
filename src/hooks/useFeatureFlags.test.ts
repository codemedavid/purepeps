import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useFeatureFlags } from './useFeatureFlags';
import { FEATURE_SETTING_KEYS } from '../utils/featureFlags';

// useFeatureFlags reads every feature row in ONE round trip and writes one row:
//   read  -> supabase.from('site_settings').select('id,value').in('id', KEYS)
//   write -> supabase.from('site_settings').upsert({ id: KEY, value })
const mockFrom = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

/** Chainable read query whose `.in()` resolves to the given rows. */
function readReturning(rows: Array<{ id: string; value: string }> | null) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
}

/** Chainable read query that fails, to prove the fail-open path. */
function readFailing() {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: null, error: { message: 'network down' } }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockChannel.mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  });
});

describe('useFeatureFlags — reading', () => {
  it('reports every feature enabled when no rows exist yet', async () => {
    mockFrom.mockReturnValue(readReturning([]));

    const { result } = renderHook(() => useFeatureFlags());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.flags.faq).toBe(true);
    expect(result.current.flags.products).toBe(true);
  });

  it('reports a feature disabled when its row says "false"', async () => {
    mockFrom.mockReturnValue(readReturning([{ id: 'feature_faq_enabled', value: 'false' }]));

    const { result } = renderHook(() => useFeatureFlags());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.flags.faq).toBe(false);
    expect(result.current.flags.calculator).toBe(true);
  });

  it('fetches all six feature keys in a single query', async () => {
    const query = readReturning([]);
    mockFrom.mockReturnValue(query);

    const { result } = renderHook(() => useFeatureFlags());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('site_settings');
    expect(query.in).toHaveBeenCalledTimes(1);
    expect(query.in).toHaveBeenCalledWith('id', [...FEATURE_SETTING_KEYS]);
  });

  it('fails open — a read error leaves every feature visible', async () => {
    mockFrom.mockReturnValue(readFailing());

    const { result } = renderHook(() => useFeatureFlags());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.flags.faq).toBe(true);
    expect(result.current.flags.lab_reports).toBe(true);
    expect(result.current.error).not.toBeNull();
  });

  it('starts in a loading state so callers never act on unresolved flags', () => {
    mockFrom.mockReturnValue(readReturning([]));

    const { result } = renderHook(() => useFeatureFlags());

    expect(result.current.loading).toBe(true);
  });
});

describe('useFeatureFlags — writing', () => {
  it('turns a feature off by upserting its own key only', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({ ...readReturning([]), upsert }));

    const { result } = renderHook(() => useFeatureFlags());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setFeatureEnabled('faq', false);
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const payload = upsert.mock.calls[0][0];
    expect(payload).toMatchObject({ id: 'feature_faq_enabled', value: 'false', type: 'boolean' });
    expect(result.current.flags.faq).toBe(false);
  });

  it('never writes to any table other than site_settings', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({ ...readReturning([]), upsert }));

    const { result } = renderHook(() => useFeatureFlags());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setFeatureEnabled('products', false);
    });

    // Turning a feature off must not touch products/faqs/protocols/coa_reports.
    for (const call of mockFrom.mock.calls) {
      expect(call[0]).toBe('site_settings');
    }
  });

  it('leaves the other six features untouched when one is switched off', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({ ...readReturning([]), upsert }));

    const { result } = renderHook(() => useFeatureFlags());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setFeatureEnabled('faq', false);
    });

    expect(result.current.flags).toEqual({
      products: true,
      calculator: true,
      protocols: true,
      track_order: true,
      faq: false,
      lab_reports: true,
      reviews: true,
    });
  });

  it('propagates a write failure instead of silently reporting success', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'denied' } });
    mockFrom.mockImplementation(() => ({ ...readReturning([]), upsert }));

    const { result } = renderHook(() => useFeatureFlags());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.setFeatureEnabled('faq', false)).rejects.toThrow();
    expect(result.current.flags.faq).toBe(true);
  });

  it('turns a feature back on by writing "true"', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({
      ...readReturning([{ id: 'feature_faq_enabled', value: 'false' }]),
      upsert,
    }));

    const { result } = renderHook(() => useFeatureFlags());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.flags.faq).toBe(false);

    await act(async () => {
      await result.current.setFeatureEnabled('faq', true);
    });

    expect(upsert.mock.calls[0][0]).toMatchObject({ id: 'feature_faq_enabled', value: 'true' });
    expect(result.current.flags.faq).toBe(true);
  });
});

describe('useFeatureFlags — live updates', () => {
  it('tears its realtime channel down on unmount', async () => {
    mockFrom.mockReturnValue(readReturning([]));

    const { result, unmount } = renderHook(() => useFeatureFlags());
    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('still resolves flags when realtime is unavailable', async () => {
    mockFrom.mockReturnValue(readReturning([{ id: 'coa_page_enabled', value: 'false' }]));
    mockChannel.mockImplementation(() => {
      throw new Error('realtime disabled for this project');
    });

    const { result } = renderHook(() => useFeatureFlags());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.flags.lab_reports).toBe(false);
  });
});
