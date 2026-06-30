import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBatchOrders } from './useBatchOrders';
import type { BatchOrder } from '../types';

// Seed orders returned by the initial load so saveItems/verify can read state.
const makeOrder = (over: Partial<BatchOrder>): BatchOrder => ({
  id: 'o',
  order_number: 'TBS-1',
  customer_name: 'A',
  customer_email: 'a@x.com',
  customer_phone: '1',
  contact_method: null,
  selected_sticker_id: null,
  selected_sticker_name: null,
  shipping_address: null,
  shipping_barangay: null,
  shipping_city: null,
  shipping_state: null,
  shipping_zip_code: null,
  shipping_country: null,
  shipping_location: null,
  order_items: [],
  subtotal: 1000,
  total_price: 1000,
  paid_total: null,
  shipping_fee: 0,
  payment_method_name: 'GCash',
  payment_proof_url: 'proof.png',
  additional_payment_proof_url: null,
  payment_status: 'pending',
  order_status: 'new',
  admin_notes: null,
  notes: null,
  tracking_number: null,
  shipping_provider: null,
  shipping_note: null,
  group_buy_batch_id: 'batch-1',
  parent_order_id: null,
  is_claim: false,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  ...over,
});

const SEED: BatchOrder[] = [
  makeOrder({ id: 'paid', payment_status: 'paid', paid_total: 1000, total_price: 1000 }),
  makeOrder({ id: 'bulk-paid', payment_status: 'paid', paid_total: null, total_price: 1000 }),
  makeOrder({ id: 'unpaid', payment_status: 'pending', paid_total: null, total_price: 1000 }),
  makeOrder({
    id: 'balance',
    payment_status: 'submitted',
    paid_total: 1000,
    total_price: 1500,
    additional_payment_proof_url: 'b.png',
  }),
];

// One thenable chain that resolves to the seeded orders for every await.
const RESULT = { data: SEED, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (value: typeof RESULT) => void) => void;
} = {
  then: (resolve) => resolve(RESULT),
  select: vi.fn(() => chain),
  order: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  in: vi.fn(() => chain),
  update: vi.fn(() => chain),
};

const mockFrom = vi.fn(() => chain);

vi.mock('../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const ITEMS_1500 = [{ product_id: 'p', product_name: 'P', variation_id: null, variation_name: null, quantity: 3, price: 500, total: 1500 }];

// The update payload passed for a given order id (last update call).
const lastUpdate = () => chain.update.mock.calls.at(-1)?.[0] as Record<string, unknown>;

async function mountLoaded() {
  const { result } = renderHook(() => useBatchOrders('batch-1'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

describe('useBatchOrders.saveItems — balance detection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flips a paid order to a balance-due state when the total increases', async () => {
    const result = await mountLoaded();
    await act(async () => {
      await result.current.saveItems('paid', ITEMS_1500);
    });

    const patch = lastUpdate();
    expect(patch.total_price).toBe(1500);
    expect(patch.payment_status).toBe('pending');
    expect(patch.additional_payment_proof_url).toBeNull();
    // paid_total stays at the previously paid amount (the baseline).
    expect(patch.paid_total).toBe(1000);
    expect(String(patch.admin_notes)).toMatch(/balance due/i);
  });

  it('self-heals paid_total for an order paid before it was tracked', async () => {
    const result = await mountLoaded();
    await act(async () => {
      await result.current.saveItems('bulk-paid', ITEMS_1500);
    });

    const patch = lastUpdate();
    expect(patch.payment_status).toBe('pending');
    // baseline derived from the pre-edit total since paid_total was null.
    expect(patch.paid_total).toBe(1000);
  });

  it('does not touch payment when editing an unpaid order', async () => {
    const result = await mountLoaded();
    await act(async () => {
      await result.current.saveItems('unpaid', ITEMS_1500);
    });

    const patch = lastUpdate();
    expect(patch.total_price).toBe(1500);
    expect(patch).not.toHaveProperty('payment_status');
    expect(patch).not.toHaveProperty('additional_payment_proof_url');
  });
});

describe('useBatchOrders — paid_total bookkeeping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records paid_total when confirming an order', async () => {
    const result = await mountLoaded();
    const order = SEED[2]; // unpaid, total 1000
    await act(async () => {
      await result.current.confirmOrder(order);
    });

    const patch = lastUpdate();
    expect(patch.order_status).toBe('confirmed');
    expect(patch.payment_status).toBe('paid');
    expect(patch.paid_total).toBe(1000);
  });

  it('verifyAdditionalPayment marks paid and advances paid_total to the new total', async () => {
    const result = await mountLoaded();
    await act(async () => {
      await result.current.verifyAdditionalPayment('balance');
    });

    const patch = lastUpdate();
    expect(patch.payment_status).toBe('paid');
    expect(patch.paid_total).toBe(1500);
  });

  it('attachAdminPaymentProof stores the proof and marks it under review', async () => {
    const result = await mountLoaded();
    await act(async () => {
      await result.current.attachAdminPaymentProof('paid', 'balance.png');
    });

    const patch = lastUpdate();
    expect(patch.additional_payment_proof_url).toBe('balance.png');
    expect(patch.payment_status).toBe('submitted');
  });
});
