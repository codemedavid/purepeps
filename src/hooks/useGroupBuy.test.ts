import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGroupBuy } from './useGroupBuy';

// A single thenable query-builder stub: every method returns the chain, and the
// chain itself resolves to an empty result when awaited. That covers both
// terminal awaits (`await from().select().order()`) and mid-chain calls
// (`from().update().eq()`), so we can assert which table/columns were written.
const RESULT = { data: [], error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: typeof RESULT) => void) => void;
} = {
  then: (resolve) => resolve(RESULT),
  select: vi.fn(() => chain),
  order: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  update: vi.fn(() => chain),
  upsert: vi.fn(() => chain),
  delete: vi.fn(() => chain),
  insert: vi.fn(() => chain),
};

const mockFrom = vi.fn(() => chain);
const mockRpc = vi.fn(() => Promise.resolve({ data: { batch: null, items: [] }, error: null }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

describe('useGroupBuy.setFulfillmentStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the stage to the selected batch on group_buy_batches', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setFulfillmentStage('batch-1', 'enroute_ph');
    });

    expect(mockFrom).toHaveBeenCalledWith('group_buy_batches');
    expect(chain.update).toHaveBeenCalledWith({ fulfillment_stage: 'enroute_ph' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'batch-1');
  });

  it('resets the stage to null', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setFulfillmentStage('batch-1', null);
    });

    expect(chain.update).toHaveBeenCalledWith({ fulfillment_stage: null });
  });
});
