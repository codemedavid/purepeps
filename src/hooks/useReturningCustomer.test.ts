import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useReturningCustomer } from './useReturningCustomer';

const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const completeRow = {
  customer_name: 'Maria Santos',
  customer_phone: '09171234567',
  contact_method: 'fb.com/maria',
  shipping_address: '123 Main St',
  shipping_barangay: 'Brgy Uno',
  shipping_city: 'Cebu City',
  shipping_state: 'Cebu',
  shipping_zip_code: '6000',
  courier_id: 'cour-1',
  shipping_location: 'lbc_provincial',
};

describe('useReturningCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not call the RPC when disabled', async () => {
    renderHook(() => useReturningCustomer('maria@example.com', false));
    // Give any effect a chance to run.
    await waitFor(() => expect(mockRpc).not.toHaveBeenCalled());
  });

  it('does not call the RPC for an empty email', async () => {
    renderHook(() => useReturningCustomer('   ', true));
    await waitFor(() => expect(mockRpc).not.toHaveBeenCalled());
  });

  it('looks up the customer by email and exposes a complete prefill', async () => {
    mockRpc.mockResolvedValue({ data: [completeRow], error: null });

    const { result } = renderHook(() => useReturningCustomer('maria@example.com', true));

    await waitFor(() => expect(result.current.found).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith('get_checkout_prefill_by_email', {
      email_input: 'maria@example.com',
    });
    expect(result.current.prefill?.fullName).toBe('Maria Santos');
    expect(result.current.isComplete).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('exposes hasOpenBatchOrder from the row so repeat orders can waive shipping', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...completeRow, has_open_batch_order: true }],
      error: null,
    });

    const { result } = renderHook(() => useReturningCustomer('maria@example.com', true));

    await waitFor(() => expect(result.current.found).toBe(true));
    expect(result.current.hasOpenBatchOrder).toBe(true);
  });

  it('defaults hasOpenBatchOrder to false when the flag is absent', async () => {
    mockRpc.mockResolvedValue({ data: [completeRow], error: null });

    const { result } = renderHook(() => useReturningCustomer('maria@example.com', true));

    await waitFor(() => expect(result.current.found).toBe(true));
    expect(result.current.hasOpenBatchOrder).toBe(false);
  });

  it('reports not-found when no prior order exists for the email', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useReturningCustomer('nobody@example.com', true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.found).toBe(false);
    expect(result.current.prefill).toBeNull();
    expect(result.current.isComplete).toBe(false);
  });

  it('fails soft (no throw, null prefill) when the RPC errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const { result } = renderHook(() => useReturningCustomer('maria@example.com', true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.found).toBe(false);
    expect(result.current.prefill).toBeNull();
  });
});
