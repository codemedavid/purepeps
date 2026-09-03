import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useUniversalMinimum } from './useUniversalMinimum';
import { DEFAULT_UNIVERSAL_MINIMUM } from '../utils/minimumOrder';

// Mirrors useFeatureFlags: all three rows in ONE round trip, one upsert to save.
const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function readReturning(rows: Array<{ id: string; value: string }> | null, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: rows, error }),
  };
}

const ENABLED_ROWS = [
  { id: 'universal_minimum_order_enabled', value: 'true' },
  { id: 'universal_minimum_order_quantity', value: '5' },
  { id: 'universal_minimum_order_unit', value: 'vial' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useUniversalMinimum — reading', () => {
  it('reads all three settings in one round trip', async () => {
    const read = readReturning(ENABLED_ROWS);
    mockFrom.mockReturnValue(read);

    const { result } = renderHook(() => useUniversalMinimum());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFrom).toHaveBeenCalledWith('site_settings');
    expect(read.in).toHaveBeenCalledTimes(1);
    expect(result.current.universal).toEqual({ enabled: true, quantity: 5, unit: 'vial' });
  });

  it('falls back to NO minimum when the settings cannot be read', async () => {
    // Fail CLOSED on enforcement, which here means enforcing nothing. A read
    // error must never invent a minimum that starts rejecting valid carts.
    mockFrom.mockReturnValue(readReturning(null, { message: 'network down' }));

    const { result } = renderHook(() => useUniversalMinimum());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.universal).toEqual(DEFAULT_UNIVERSAL_MINIMUM);
    expect(result.current.universal.enabled).toBe(false);
  });

  it('falls back to no minimum when the rows were never seeded', async () => {
    mockFrom.mockReturnValue(readReturning([]));

    const { result } = renderHook(() => useUniversalMinimum());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.universal.enabled).toBe(false);
  });
});

describe('useUniversalMinimum — saving', () => {
  it('writes all three rows together', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({ ...readReturning(ENABLED_ROWS), upsert }));

    const { result } = renderHook(() => useUniversalMinimum());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save({ enabled: true, quantity: 8, unit: 'box' });
    });

    const written = upsert.mock.calls[0][0] as Array<{ id: string; value: string }>;
    expect(written).toHaveLength(3);
    expect(written).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'universal_minimum_order_quantity', value: '8' }),
        expect.objectContaining({ id: 'universal_minimum_order_unit', value: 'box' }),
        expect.objectContaining({ id: 'universal_minimum_order_enabled', value: 'true' }),
      ]),
    );
  });

  it('shows the new setting immediately rather than after a refetch', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({ ...readReturning([]), upsert }));

    const { result } = renderHook(() => useUniversalMinimum());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save({ enabled: true, quantity: 8, unit: 'box' });
    });

    expect(result.current.universal).toEqual({ enabled: true, quantity: 8, unit: 'box' });
  });

  it('propagates a write failure instead of reporting success', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'denied' } });
    mockFrom.mockImplementation(() => ({ ...readReturning([]), upsert }));

    const { result } = renderHook(() => useUniversalMinimum());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      result.current.save({ enabled: true, quantity: 8, unit: 'box' }),
    ).rejects.toThrow();
  });

  it('leaves the shown setting untouched when the write fails', async () => {
    // Showing 8 after a failed save would tell the admin a minimum is live
    // that no shopper is actually subject to.
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'denied' } });
    mockFrom.mockImplementation(() => ({ ...readReturning(ENABLED_ROWS), upsert }));

    const { result } = renderHook(() => useUniversalMinimum());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save({ enabled: true, quantity: 8, unit: 'box' }).catch(() => {});
    });

    expect(result.current.universal.quantity).toBe(5);
  });
});
