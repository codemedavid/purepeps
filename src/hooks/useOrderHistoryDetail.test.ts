import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOrderHistoryDetail } from './useOrderHistoryDetail';

const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const sampleRow = {
  id: 'order-1',
  order_number: 'TBS-000123',
  created_at: '2026-03-01T02:00:00Z',
  customer_name: 'Maria Santos',
  customer_email: 'maria@example.com',
  order_items: [],
  status_events: [],
  total_price: 5000,
  shipping_fee: 200,
  payment_status: 'pending',
  order_status: 'new',
};

beforeEach(() => {
  mockRpc.mockReset();
});

describe('useOrderHistoryDetail', () => {
  it('starts empty and idle', () => {
    const { result } = renderHook(() => useOrderHistoryDetail());

    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('loads a customer history by email through the email RPC', async () => {
    mockRpc.mockResolvedValue({ data: [sampleRow], error: null });
    const { result } = renderHook(() => useOrderHistoryDetail());

    await act(async () => {
      await result.current.loadByEmail('  Maria@Example.com  ');
    });

    expect(mockRpc).toHaveBeenCalledWith('get_order_history_by_email', {
      p_email: 'maria@example.com',
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
  });

  it('sends both the order number and the email to the by-number RPC', async () => {
    // The email is the second factor; the RPC refuses without it.
    mockRpc.mockResolvedValue({ data: [sampleRow], error: null });
    const { result } = renderHook(() => useOrderHistoryDetail());

    await act(async () => {
      await result.current.loadByOrderNumber(' tbs-000123 ', ' Maria@Example.com ');
    });

    expect(mockRpc).toHaveBeenCalledWith('get_order_history_by_number', {
      p_order_number: 'tbs-000123',
      p_email: 'maria@example.com',
    });
  });

  it('does not call the RPC when the email is blank', async () => {
    const { result } = renderHook(() => useOrderHistoryDetail());

    await act(async () => {
      await result.current.loadByEmail('   ');
    });

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('normalizes a missing data payload to an empty list rather than throwing', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useOrderHistoryDetail());

    await act(async () => {
      await result.current.loadByEmail('maria@example.com');
    });

    expect(result.current.rows).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces the real reason when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function' } });
    const { result } = renderHook(() => useOrderHistoryDetail());

    await act(async () => {
      await result.current.loadByEmail('maria@example.com');
    });

    await waitFor(() => expect(result.current.error).toContain('permission denied'));
    expect(result.current.rows).toEqual([]);
  });

  it('clears a previous error on the next successful load', async () => {
    const { result } = renderHook(() => useOrderHistoryDetail());

    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await act(async () => {
      await result.current.loadByEmail('maria@example.com');
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    mockRpc.mockResolvedValue({ data: [sampleRow], error: null });
    await act(async () => {
      await result.current.loadByEmail('maria@example.com');
    });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.rows).toHaveLength(1);
  });

  it('coerces order_items and status_events to arrays when the row omits them', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...sampleRow, order_items: null, status_events: null }],
      error: null,
    });
    const { result } = renderHook(() => useOrderHistoryDetail());

    await act(async () => {
      await result.current.loadByEmail('maria@example.com');
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].order_items).toEqual([]);
    expect(result.current.rows[0].status_events).toEqual([]);
  });

  it('drops previously loaded rows on reset', async () => {
    mockRpc.mockResolvedValue({ data: [sampleRow], error: null });
    const { result } = renderHook(() => useOrderHistoryDetail());

    await act(async () => {
      await result.current.loadByEmail('maria@example.com');
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() => result.current.reset());

    expect(result.current.rows).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
