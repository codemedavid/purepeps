import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGbLanding } from './useGbLanding';
import { DEFAULT_GB_LANDING, GB_LANDING_KEYS } from '../utils/gbLanding';

const selectIn = vi.fn();
const upsert = vi.fn();
const removeChannel = vi.fn();

// Every reference is deferred to call time: `vi.mock` is hoisted above the
// `const` declarations above, so naming them directly in the factory body
// would read them before initialisation.
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: (...args: unknown[]) => selectIn(...args) }),
      upsert: (...args: unknown[]) => upsert(...args),
    }),
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: (...args: unknown[]) => removeChannel(...args),
  },
}));

describe('useGbLanding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectIn.mockResolvedValue({ data: [], error: null });
    upsert.mockResolvedValue({ error: null });
  });

  it('reads every landing key in one round trip', async () => {
    const { result } = renderHook(() => useGbLanding());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(selectIn).toHaveBeenCalledTimes(1);
    const [column, keys] = selectIn.mock.calls[0];
    expect(column).toBe('id');
    expect([...keys].sort()).toEqual([...GB_LANDING_KEYS].sort());
  });

  it('projects stored rows onto the landing content', async () => {
    selectIn.mockResolvedValue({
      data: [
        { id: 'gb_landing_headline', value: 'Batch 12 is live,' },
        { id: 'gb_landing_stage2_date', value: 'Sep 12' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useGbLanding());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.content.headline).toBe('Batch 12 is live,');
    expect(result.current.content.stages[1].date).toBe('Sep 12');
    // Everything the admin has not set still falls back.
    expect(result.current.content.bottomNote).toBe(DEFAULT_GB_LANDING.bottomNote);
  });

  it('fails open to the defaults so a settings outage never blanks the homepage', async () => {
    selectIn.mockResolvedValue({ data: null, error: { message: 'network down' } });

    const { result } = renderHook(() => useGbLanding());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.content).toEqual(DEFAULT_GB_LANDING);
    expect(result.current.error).not.toBeNull();
  });

  it('upserts one row per field when saving', async () => {
    const { result } = renderHook(() => useGbLanding());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.save({ ...DEFAULT_GB_LANDING, headline: 'Edited' });

    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows] = upsert.mock.calls[0];
    expect(rows).toHaveLength(GB_LANDING_KEYS.length);
    expect(rows.find((row: { id: string }) => row.id === 'gb_landing_headline').value).toBe(
      'Edited',
    );
  });

  it('surfaces a save failure instead of silently dropping the edit', async () => {
    upsert.mockResolvedValue({ error: { message: 'permission denied' } });
    const { result } = renderHook(() => useGbLanding());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.save(DEFAULT_GB_LANDING)).rejects.toThrow(/permission denied/);
  });
});
