import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStorefrontNotice } from './useStorefrontNotice';

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

  it('shows nothing while the public query is still in flight', () => {
    mockRpc.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useStorefrontNotice('storefront.menu', 'visitor'));

    // A pop-up that appears before we know whether one is published would
    // flash on every visit — which is exactly the behaviour being removed.
    expect(result.current.notice).toBeNull();
  });

  it('maps the public RPC payload to the notice model', async () => {
    mockRpc.mockResolvedValueOnce({ data: [row], error: null });

    const { result } = renderHook(() => useStorefrontNotice('storefront.menu', 'visitor'));

    await waitFor(() => expect(result.current.notice).toEqual(expect.objectContaining({
      id: row.id,
      title: 'Heads Up',
      frequency: 'once',
      style: 'critical',
      pageIds: ['storefront.menu'],
      policyTitle: 'Delivery',
    })));
    expect(result.current.error).toBeNull();
  });

  // The pop-up is OFF unless an admin publishes one. The Notice Manager is the
  // single source of truth: a hard-coded fallback here used to re-open the
  // legal modal on every visit even with nothing published and the toggle off,
  // which meant the admin's own switch could not turn it off.
  it.each(['storefront.landing', 'storefront.menu', 'storefront.cart'] as const)(
    'shows no notice on %s when nothing is published',
    async (pageId) => {
      const { result } = renderHook(() => useStorefrontNotice(pageId, 'visitor'));

      await waitFor(() => expect(mockRpc).toHaveBeenCalled());
      expect(result.current.notice).toBeNull();
      expect(result.current.error).toBeNull();
    },
  );

  it('still shows a notice the admin HAS published', async () => {
    mockRpc.mockResolvedValueOnce({ data: [row], error: null });

    const { result } = renderHook(() => useStorefrontNotice('storefront.menu', 'visitor'));

    await waitFor(() => expect(result.current.notice?.title).toBe('Heads Up'));
  });

  it('does not force the legal notice onto a standalone public page', async () => {
    const { result } = renderHook(() => useStorefrontNotice('faq', 'visitor'));

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(result.current.notice).toBeNull();
  });

  it('shows no notice when retrieval fails, rather than blocking the page', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network down' } });

    const { result } = renderHook(() => useStorefrontNotice('storefront.menu', 'visitor'));

    await waitFor(() => expect(result.current.error).toBe('network down'));
    expect(result.current.notice).toBeNull();
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

  it('sends no analytics when there is no notice on screen', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const { result } = renderHook(() => useStorefrontNotice('storefront.menu', 'visitor'));
    await waitFor(() => expect(result.current.error).toBe('offline'));

    await act(() => result.current.recordEvent('impression'));

    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
