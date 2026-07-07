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
  is: vi.fn(() => chain),
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

describe('useGroupBuy.fetchBatchTierIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads tier_id rows for the batch from batch_tiers', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.fetchBatchTierIds('batch-1');
    });

    expect(mockFrom).toHaveBeenCalledWith('batch_tiers');
    expect(chain.select).toHaveBeenCalledWith('tier_id');
    expect(chain.eq).toHaveBeenCalledWith('group_buy_batch_id', 'batch-1');
  });
});

describe('useGroupBuy.fetchOfferableTiers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads active tiers ordered by sort order', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.fetchOfferableTiers();
    });

    expect(mockFrom).toHaveBeenCalledWith('tiers');
    expect(chain.eq).toHaveBeenCalledWith('active', true);
    expect(chain.order).toHaveBeenCalledWith('sort_order', { ascending: true });
  });
});

describe('useGroupBuy.updateBatchSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the name, schedule, and offered tiers for the batch', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateBatchSettings('batch-1', {
        name: 'July Drop',
        startsAt: '2026-06-22',
        endsAt: '2026-07-05',
        tierIds: ['t1', 't2'],
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('group_buy_batches');
    expect(chain.update).toHaveBeenCalledWith({ name: 'July Drop' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'batch-1');
    expect(mockRpc).toHaveBeenCalledWith('set_group_buy_schedule', {
      p_id: 'batch-1',
      p_starts_at: '2026-06-22',
      p_ends_at: '2026-07-05',
    });
    expect(mockRpc).toHaveBeenCalledWith('set_batch_tiers', {
      p_batch_id: 'batch-1',
      p_tier_ids: ['t1', 't2'],
    });
  });

  it('stores a blank name as null', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateBatchSettings('batch-1', {
        name: null,
        startsAt: null,
        endsAt: null,
        tierIds: [],
      });
    });

    expect(chain.update).toHaveBeenCalledWith({ name: null });
  });
});

describe('useGroupBuy.setCap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a product-level cap (variation_id null) by replacing the existing row', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setCap('batch-1', 'prod-1', 10);
    });

    expect(mockFrom).toHaveBeenCalledWith('group_buy_caps');
    expect(chain.eq).toHaveBeenCalledWith('batch_id', 'batch-1');
    expect(chain.eq).toHaveBeenCalledWith('product_id', 'prod-1');
    expect(chain.is).toHaveBeenCalledWith('variation_id', null);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        batch_id: 'batch-1',
        product_id: 'prod-1',
        variation_id: null,
        cap_quantity: 10,
      }),
    );
  });

  it('writes a variation cap scoped to the given variation_id', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setCap('batch-1', 'prod-1', 20, 'var-9');
    });

    expect(chain.eq).toHaveBeenCalledWith('variation_id', 'var-9');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        batch_id: 'batch-1',
        product_id: 'prod-1',
        variation_id: 'var-9',
        cap_quantity: 20,
      }),
    );
  });
});

describe('useGroupBuy.removeCap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the product-level cap using an IS NULL variation filter', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeCap('batch-1', 'prod-1');
    });

    expect(mockFrom).toHaveBeenCalledWith('group_buy_caps');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.is).toHaveBeenCalledWith('variation_id', null);
  });

  it('deletes a specific variation cap by variation_id', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeCap('batch-1', 'prod-1', 'var-9');
    });

    expect(chain.eq).toHaveBeenCalledWith('variation_id', 'var-9');
  });
});

describe('useGroupBuy.setViewOnlyMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables view-only mode via the set_group_buy_view_only_mode RPC', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setViewOnlyMode('batch-1', true);
    });

    expect(mockRpc).toHaveBeenCalledWith('set_group_buy_view_only_mode', {
      p_id: 'batch-1',
      p_enabled: true,
    });
  });

  it('disables view-only mode ("allow adding now")', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setViewOnlyMode('batch-1', false);
    });

    expect(mockRpc).toHaveBeenCalledWith('set_group_buy_view_only_mode', {
      p_id: 'batch-1',
      p_enabled: false,
    });
  });
});

describe('useGroupBuy.openBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a batch with null tier ids so the server offers its default tiers', async () => {
    const { result } = renderHook(() => useGroupBuy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.openBatch('June Drop', '2026-06-22', '2026-07-05');
    });

    expect(mockRpc).toHaveBeenCalledWith('open_group_buy_batch', {
      p_name: 'June Drop',
      p_starts_at: '2026-06-22',
      p_ends_at: '2026-07-05',
      p_tier_ids: null,
    });
  });
});
