import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GroupBuyManager from './GroupBuyManager';
import type { GroupBuyBatch } from '../types';

// Every data hook is stubbed: this suite is about the admin's Group Buy screen
// mounting at all, not about what Supabase returns.
const kitAllocationSpy = vi.fn();

const openBatch: GroupBuyBatch = {
  id: 'batch-1',
  batch_number: 12,
  status: 'open',
  name: 'Batch 12',
  opened_at: '2026-09-01T00:00:00Z',
  closed_at: null,
  finalized_at: null,
  fulfillment_stage: null,
};

const state = {
  batches: [] as GroupBuyBatch[],
  activeBatch: null as GroupBuyBatch | null,
};

const noop = () => Promise.resolve();
const emptyList = () => Promise.resolve([]);

// The real hooks hold these in useState, so their identity is stable across
// renders. Stubs must be stable too: a fresh array literal per render makes
// every dependency array look changed and spins the effects forever.
const NO_CAPS: never[] = [];
const NO_ORDERS: never[] = [];
const NO_MEMBERS: never[] = [];
const NO_TIERS: never[] = [];
const NO_REQUESTS: never[] = [];
const NO_PRODUCTS: never[] = [];
const EMPTY_PROGRESS = { batch: null, items: [] as never[] };

vi.mock('../hooks/useGroupBuy', () => ({
  useGroupBuy: () => ({
    batches: state.batches,
    activeBatch: state.activeBatch,
    caps: NO_CAPS,
    progress: EMPTY_PROGRESS,
    loading: false,
    error: null,
    refresh: noop,
    openBatch: noop,
    setSchedule: noop,
    setPasaloMode: noop,
    setViewOnlyMode: noop,
    fetchOfferableTiers: emptyList,
    fetchBatchTierIds: emptyList,
    updateBatchSettings: noop,
    closeBatch: noop,
    startFinalizing: noop,
    finalizeBatch: noop,
    reopenBatch: noop,
    fetchBatchRemaining: emptyList,
    setCap: noop,
    removeCap: noop,
    setFulfillmentStage: noop,
    fetchProgress: noop,
    fetchBatchOrders: emptyList,
  }),
}));

vi.mock('../hooks/useBatchOrders', () => ({
  useBatchOrders: () => ({
    orders: NO_ORDERS,
    loading: false,
    error: null,
    reload: noop,
    confirmOrder: noop,
    verifyAdditionalPayment: noop,
    attachAdminPaymentProof: noop,
    updateStatus: noop,
    cancelOrder: noop,
    saveTracking: noop,
    saveItems: noop,
    addLinkedOrder: noop,
    bulkUpdateStatus: noop,
  }),
}));

vi.mock('../hooks/useBatchMembers', () => ({
  useBatchMembers: () => ({ members: NO_MEMBERS, loading: false, error: null, reload: noop }),
}));

vi.mock('../hooks/useTierCatalog', () => ({
  useTierCatalog: () => ({ tiers: NO_TIERS, loading: false, error: null, refresh: noop }),
}));

vi.mock('../hooks/useAccessRequests', () => ({
  useAccessRequests: () => ({
    requests: NO_REQUESTS,
    loading: false,
    error: null,
    fetchAll: noop,
    submitRequest: noop,
    updateStatus: noop,
    setTier: noop,
  }),
}));

vi.mock('../hooks/useMenu', () => ({
  useMenu: () => ({
    menuItems: NO_PRODUCTS,
    products: NO_PRODUCTS,
    loading: false,
    error: null,
    refreshProducts: noop,
    addProduct: noop,
    updateProduct: noop,
    deleteProduct: noop,
    addVariation: noop,
    updateVariation: noop,
    deleteVariation: noop,
  }),
}));

const kitAllocationResult = {
  preview: null,
  locked: false,
  loading: false,
  error: null,
  previewAllocation: noop,
  lockAllocation: noop,
  recalculateAllocation: noop,
};

vi.mock('../hooks/useKitAllocation', () => ({
  useKitAllocation: (batchId: string | null) => {
    kitAllocationSpy(batchId);
    return kitAllocationResult;
  },
  default: (batchId: string | null) => {
    kitAllocationSpy(batchId);
    return kitAllocationResult;
  },
}));

describe('GroupBuyManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.batches = [];
    state.activeBatch = null;
  });

  it('renders the Group Buy screen when an admin opens it with no batches yet', () => {
    render(<GroupBuyManager onBack={() => {}} />);

    expect(screen.getByRole('heading', { name: /group buy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to dashboard/i })).toBeInTheDocument();
  });

  it('renders the Group Buy screen when a batch is open', () => {
    state.batches = [openBatch];
    state.activeBatch = openBatch;

    render(<GroupBuyManager onBack={() => {}} />);

    expect(screen.getByRole('heading', { name: /group buy/i })).toBeInTheDocument();
  });

  it('subscribes the kit allocation to the batch in view, not to null', () => {
    state.batches = [openBatch];
    state.activeBatch = openBatch;

    render(<GroupBuyManager onBack={() => {}} />);

    expect(kitAllocationSpy).toHaveBeenCalledWith(openBatch.id);
  });
});
