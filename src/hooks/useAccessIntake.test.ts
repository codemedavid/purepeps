import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAccessIntake } from './useAccessIntake';

// useAccessIntake reads/writes a single site_settings row (access_requests_open):
//   read  -> supabase.from('site_settings').select('value').eq('id', KEY).maybeSingle()
//   write -> supabase.from('site_settings').upsert({ id: KEY, value })
const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

/** Chainable read query that resolves .maybeSingle() to `{ value }` (or null). */
function readReturning(value: string | null) {
  const row = value === null ? null : { value };
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAccessIntake', () => {
  it('reports intake OPEN when the setting is missing (default)', async () => {
    mockFrom.mockReturnValue(readReturning(null));

    const { result } = renderHook(() => useAccessIntake());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isIntakeOpen).toBe(true);
  });

  it("reports intake OPEN when the setting value is 'true'", async () => {
    mockFrom.mockReturnValue(readReturning('true'));

    const { result } = renderHook(() => useAccessIntake());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isIntakeOpen).toBe(true);
  });

  it("reports intake CLOSED when the setting value is 'false'", async () => {
    mockFrom.mockReturnValue(readReturning('false'));

    const { result } = renderHook(() => useAccessIntake());

    await waitFor(() => expect(result.current.isIntakeOpen).toBe(false));
    expect(result.current.loading).toBe(false);
  });

  it('fails OPEN when the read errors (DB trigger stays the real gate)', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    });

    const { result } = renderHook(() => useAccessIntake());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isIntakeOpen).toBe(true);
  });

  it('setIntakeOpen(false) upserts the setting and flips local state', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    // First call = initial read (open); subsequent calls = the write.
    mockFrom.mockReturnValueOnce(readReturning('true')).mockReturnValue({ upsert });

    const { result } = renderHook(() => useAccessIntake());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setIntakeOpen(false);
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'access_requests_open', value: 'false' }),
    );
    expect(result.current.isIntakeOpen).toBe(false);
  });
});
