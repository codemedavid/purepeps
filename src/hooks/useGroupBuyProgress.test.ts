import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GROUP_BUY_PROGRESS_POLL_MS, useGroupBuyProgress } from './useGroupBuyProgress';

const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const openProgress = {
  batch: { id: 'batch-1', status: 'open', batch_number: 12 },
  items: [],
};

const closedProgress = { batch: null, items: [] };

describe('useGroupBuyProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: openProgress, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports an open batch from the public progress RPC', async () => {
    const { result } = renderHook(() => useGroupBuyProgress());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isBatchOpen).toBe(true);
    expect(result.current.batch?.batch_number).toBe(12);
  });

  it('keeps the last open batch when a silent poll fails', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGroupBuyProgress());
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(result.current.isBatchOpen).toBe(true);

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network blip' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GROUP_BUY_PROGRESS_POLL_MS);
    });

    expect(result.current.isBatchOpen).toBe(true);
    expect(result.current.batch?.batch_number).toBe(12);
    expect(result.current.error).toBeTruthy();
  });

  it('polls while the tab is visible so a close does not wait for a refresh', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGroupBuyProgress());
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(result.current.isBatchOpen).toBe(true);

    mockRpc.mockResolvedValueOnce({ data: closedProgress, error: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GROUP_BUY_PROGRESS_POLL_MS);
    });

    expect(result.current.isBatchOpen).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});
