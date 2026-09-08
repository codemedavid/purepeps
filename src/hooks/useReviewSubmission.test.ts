import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useReviewSubmission } from './useReviewSubmission';

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

/** site_settings read for the photo switch, matching useFeatureFlags' shape. */
function mediaSetting(value: string | null) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: value === null ? [] : [{ id: 'feature_review_media_enabled', value }],
      error: null,
    }),
  };
}

const ONE_PRODUCT = [
  {
    product_id: 'prod-1',
    product_name: 'BPC-157',
    variation_name: '10mg',
    already_reviewed: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue(mediaSetting('true'));
});

async function mounted() {
  const view = renderHook(() => useReviewSubmission());
  await waitFor(() => expect(view.result.current.loadingSettings).toBe(false));
  return view;
}

describe('useReviewSubmission — proving the order', () => {
  it('sends the order number and email to the verification RPC', async () => {
    mockRpc.mockResolvedValue({ data: ONE_PRODUCT, error: null });
    const { result } = await mounted();

    await act(async () => {
      await result.current.lookup('  PP-1042 ', ' Maria@Example.COM ');
    });

    expect(mockRpc).toHaveBeenCalledWith('get_reviewable_order', {
      p_order_number: 'pp-1042',
      p_email: 'maria@example.com',
    });
    expect(result.current.verified).toBe(true);
    expect(result.current.products).toHaveLength(1);
  });

  it('treats a wrong email and an unknown order identically', async () => {
    // The RPC returns zero rows for both on purpose, so an attacker cannot use
    // this form to test whether an address ever ordered. The message must not
    // reintroduce the distinction the SQL was careful to remove.
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { result } = await mounted();

    await act(async () => {
      await result.current.lookup('PP-9999', 'nobody@example.com');
    });

    expect(result.current.verified).toBe(false);
    expect(result.current.error).toMatch(/could not find a delivered order/i);
    expect(result.current.error).not.toMatch(/email|password|exists/i);
  });

  it('refuses to call the RPC when a field is blank', async () => {
    const { result } = await mounted();

    await act(async () => {
      await result.current.lookup('', 'maria@example.com');
    });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  it('surfaces a lookup failure without claiming the order is unknown', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc down' } });
    const { result } = await mounted();

    await act(async () => {
      await result.current.lookup('PP-1042', 'maria@example.com');
    });

    expect(result.current.verified).toBe(false);
    expect(result.current.error).toBeTruthy();
  });
});

describe('useReviewSubmission — submitting', () => {
  async function verified() {
    mockRpc.mockResolvedValue({ data: ONE_PRODUCT, error: null });
    const view = await mounted();
    await act(async () => {
      await view.result.current.lookup('PP-1042', 'maria@example.com');
    });
    mockRpc.mockClear();
    return view;
  }

  const goodInput = {
    productId: 'prod-1',
    rating: 5,
    body: 'Arrived sealed and well packed.',
    displayName: 'Sakura22',
    photoUrls: [] as string[],
  };

  it('submits the review against the proven order', async () => {
    const { result } = await verified();
    mockRpc.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      await result.current.submit(goodInput);
    });

    expect(mockRpc).toHaveBeenCalledWith('submit_product_review', {
      p_order_number: 'pp-1042',
      p_email: 'maria@example.com',
      p_product_id: 'prod-1',
      p_rating: 5,
      p_body: 'Arrived sealed and well packed.',
      p_display_name: 'Sakura22',
      p_media_urls: [],
    });
    expect(result.current.submitted).toBe(true);
  });

  it('reports every invalid field at once instead of one per attempt', async () => {
    const { result } = await verified();

    await act(async () => {
      await result.current.submit({ ...goodInput, rating: 0, body: 'short' });
    });

    expect(result.current.fieldErrors.rating).toBeTruthy();
    expect(result.current.fieldErrors.body).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('never sends a review before an order has been proven', async () => {
    const { result } = await mounted();

    await act(async () => {
      await result.current.submit(goodInput);
    });

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('drops photos when the admin has the photo switch off', async () => {
    // submit_product_review blanks media server-side too; sending them anyway
    // would upload files the database is about to discard.
    mockFrom.mockReturnValue(mediaSetting('false'));
    const { result } = await verified();
    mockRpc.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      await result.current.submit({ ...goodInput, photoUrls: ['https://img/a.jpg'] });
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'submit_product_review',
      expect.objectContaining({ p_media_urls: [] }),
    );
  });

  it('keeps photos when the switch is on', async () => {
    const { result } = await verified();
    mockRpc.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      await result.current.submit({ ...goodInput, photoUrls: ['https://img/a.jpg'] });
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'submit_product_review',
      expect.objectContaining({ p_media_urls: ['https://img/a.jpg'] }),
    );
  });

  it('leaves photos enabled when the setting row is missing', async () => {
    // Fail-open matches featureFlags: an un-seeded database must not silently
    // strip attachments.
    mockFrom.mockReturnValue(mediaSetting(null));
    const { result } = await mounted();

    expect(result.current.mediaEnabled).toBe(true);
  });

  it('surfaces the database message when submission is rejected', async () => {
    // submit_product_review raises readable messages ("Please choose a star
    // rating..."), which are better than anything invented here.
    const { result } = await verified();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'You already reviewed this item.' } });

    await act(async () => {
      await result.current.submit(goodInput);
    });

    expect(result.current.error).toMatch(/already reviewed/i);
    expect(result.current.submitted).toBe(false);
  });

  it('clears everything on reset so a second review starts clean', async () => {
    const { result } = await verified();
    mockRpc.mockResolvedValue({ data: null, error: null });
    await act(async () => {
      await result.current.submit(goodInput);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.verified).toBe(false);
    expect(result.current.submitted).toBe(false);
    expect(result.current.products).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

/**
 * Reproduces the client's report end to end at the hook boundary.
 *
 * `get_reviewable_order` returns zero rows for THREE different situations —
 * unknown order, wrong email, and an order that is simply not delivered yet.
 * Only the third one has an answer the customer can act on, so the hook asks a
 * second, status-only question before falling back to the generic message.
 */
describe('useReviewSubmission — an order that exists but is not delivered', () => {
  /** Routes each RPC name to its own canned reply. */
  function rpcRouter(replies: Record<string, { data: unknown; error: unknown }>) {
    return (name: string) =>
      Promise.resolve(replies[name] ?? { data: null, error: null });
  }

  it('asks for the order status when the delivered lookup finds nothing', async () => {
    mockRpc.mockImplementation(
      rpcRouter({
        get_reviewable_order: { data: [], error: null },
        get_order_review_status: { data: [{ order_status: 'packing' }], error: null },
      }),
    );
    const { result } = await mounted();

    await act(async () => {
      await result.current.lookup(' TBS-100740-4243 ', ' AdminPretty@Gmail.com ');
    });

    expect(mockRpc).toHaveBeenCalledWith('get_order_review_status', {
      p_order_number: 'tbs-100740-4243',
      p_email: 'adminpretty@gmail.com',
    });
  });

  it('tells the customer the real status instead of "we could not find it"', async () => {
    mockRpc.mockImplementation(
      rpcRouter({
        get_reviewable_order: { data: [], error: null },
        get_order_review_status: { data: [{ order_status: 'packing' }], error: null },
      }),
    );
    const { result } = await mounted();

    await act(async () => {
      await result.current.lookup('TBS-100740-4243', 'adminpretty@gmail.com');
    });

    expect(result.current.error).toMatch(/packing/i);
    expect(result.current.error).toMatch(/delivered/i);
    expect(result.current.error).not.toMatch(/could not find/i);
    expect(result.current.orderStatus).toBe('packing');
    expect(result.current.verified).toBe(false);
  });

  it('keeps the generic message when the order truly does not match', async () => {
    // A wrong email and an unknown order both land here, and must stay
    // indistinguishable — the status RPC returns nothing for either.
    mockRpc.mockImplementation(
      rpcRouter({
        get_reviewable_order: { data: [], error: null },
        get_order_review_status: { data: [], error: null },
      }),
    );
    const { result } = await mounted();

    await act(async () => {
      await result.current.lookup('TBS-0000-0000', 'nobody@example.com');
    });

    expect(result.current.error).toMatch(/could not find a delivered order/i);
    expect(result.current.orderStatus).toBeNull();
  });

  it('falls back to the generic message when the status question itself fails', async () => {
    mockRpc.mockImplementation(
      rpcRouter({
        get_reviewable_order: { data: [], error: null },
        get_order_review_status: { data: null, error: { message: 'boom' } },
      }),
    );
    const { result } = await mounted();

    await act(async () => {
      await result.current.lookup('TBS-100740-4243', 'adminpretty@gmail.com');
    });

    expect(result.current.error).toMatch(/could not find a delivered order/i);
    expect(result.current.verified).toBe(false);
  });

  it('does not ask for a status when the order was reviewable all along', async () => {
    mockRpc.mockImplementation(
      rpcRouter({ get_reviewable_order: { data: ONE_PRODUCT, error: null } }),
    );
    const { result } = await mounted();

    await act(async () => {
      await result.current.lookup('TBS-100740-4243', 'adminpretty@gmail.com');
    });

    expect(result.current.verified).toBe(true);
    expect(result.current.orderStatus).toBe('delivered');
    expect(mockRpc).not.toHaveBeenCalledWith('get_order_review_status', expect.anything());
  });

  it('clears a carried-over status on the next lookup', async () => {
    mockRpc.mockImplementation(
      rpcRouter({
        get_reviewable_order: { data: [], error: null },
        get_order_review_status: { data: [{ order_status: 'packing' }], error: null },
      }),
    );
    const { result } = await mounted();
    await act(async () => {
      await result.current.lookup('TBS-100740-4243', 'adminpretty@gmail.com');
    });
    expect(result.current.orderStatus).toBe('packing');

    mockRpc.mockImplementation(
      rpcRouter({
        get_reviewable_order: { data: [], error: null },
        get_order_review_status: { data: [], error: null },
      }),
    );
    await act(async () => {
      await result.current.lookup('TBS-0000-0000', 'nobody@example.com');
    });

    expect(result.current.orderStatus).toBeNull();
  });
});
