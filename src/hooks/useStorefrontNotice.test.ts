import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStorefrontNotice } from './useStorefrontNotice';
import { DEFAULT_STOREFRONT_NOTICE } from '../utils/storefrontNotice';

const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

const row = {
  id: '6f8a5363-56b9-4fdd-a985-260c8f910ccb',
  version: 2,
  priority: 10,
  starts_at: null,
  ends_at: null,
  audience: 'everyone',
  page_ids: ['storefront.menu'],
  frequency: 'once',
  style: 'critical',
  title: 'Heads Up',
  subtitle: 'Read this',
  body: 'Research use only.',
  highlight: 'No rush orders',
  policy_title: 'Delivery',
  policy_lines: 'Monday-Friday',
  button_label: 'Agree',
  footer_note: 'Thank you',
  published_at: '2026-08-12T10:00:00.000Z',
};

describe('useStorefrontNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('requests the highest eligible notice for the page and shopper type', async () => {
    renderHook(() => useStorefrontNotice('storefront.menu', 'verified_member'));

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(mockRpc).toHaveBeenCalledWith('get_active_storefront_notice', {
      p_page_id: 'storefront.menu',
      p_audience: 'verified_member',
    });
  });

  it('maps the public RPC payload to the notice model', async () => {
    mockRpc.mockResolvedValueOnce({ data: [row], error: null });

    const { result } = renderHook(() => useStorefrontNotice('storefront.menu', 'visitor'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notice).toEqual(expect.objectContaining({
      id: row.id,
      title: 'Heads Up',
      frequency: 'once',
      style: 'critical',
      pageIds: ['storefront.menu'],
      policyTitle: 'Delivery',
    }));
    expect(result.current.error).toBeNull();
  });

  it('returns no modal after a successful empty query', async () => {
    const { result } = renderHook(() => useStorefrontNotice('faq', 'visitor'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notice).toBeNull();
  });

  it('uses the legal fallback when retrieval fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network down' } });

    const { result } = renderHook(() => useStorefrontNotice('faq', 'visitor'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notice).toEqual(DEFAULT_STOREFRONT_NOTICE);
    expect(result.current.error).toBe('network down');
  });

  it('records anonymous events for a persisted notice version', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useStorefrontNotice('storefront.menu', 'visitor'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.recordEvent('acknowledgement'));

    expect(mockRpc).toHaveBeenLastCalledWith('record_storefront_notice_event', {
      p_notice_id: row.id,
      p_version: 2,
      p_event: 'acknowledgement',
    });
  });

  it('does not send analytics for the hard-coded fallback', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const { result } = renderHook(() => useStorefrontNotice('storefront.menu', 'visitor'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.recordEvent('impression'));

    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
