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

vi.mock('../hooks/useGroupBuy', () => ({
  useGroupBuy: () => ({
    batches: state.batches,
    activeBatch: state.activeBatch,
    caps: [],
    progress: { batch: null, items: [] },
    loading: false,
    error: null,
    refresh: noop,
    openBatch: noop,
    setSchedule: noop,
    setPasaloMode: noop,
    setViewOnlyMode: noop,
    fetchOfferableTiers: () => Promise.resolve([]),
    fetchBatchTierIds: () => Promise.resolve([]),
    updateBatchSettings: noop,
    closeBatch: noop,
    startFinalizing: noop,
    finalizeBatch: noop,
    reopenBatch: noop,
    fetchBatchRemaining: () => Promise.resolve([]),
    setCap: noop,
    removeCap: noop,
    setFulfillmentStage: noop,
    fetchProgress: noop,
    fetchBatchOrders: () => Promise.resolve([]),
  }),
}));

vi.mock('../hooks/useBatchOrders', () => ({
  useBatchOrders: () => ({
    orders: [],
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
  useBatchMembers: () => ({ members: [], loading: false, error: null, reload: noop }),
}));

vi.mock('../hooks/useTierCatalog', () => ({
  useTierCatalog: () => ({ tiers: [], loading: false, error: null, refresh: noop }),
}));

vi.mock('../hooks/useAccessRequests', () => ({
  useAccessRequests: () => ({
    requests: [],
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
    menuItems: [],
    products: [],
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
