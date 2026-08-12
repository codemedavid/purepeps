import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStorefrontNoticesAdmin } from './useStorefrontNoticesAdmin';
import { DEFAULT_STOREFRONT_NOTICE, createBlankStorefrontNotice } from '../utils/storefrontNotice';

const mockNoticeList = vi.fn();
const mockStatsList = vi.fn();
const mockInsertSingle = vi.fn();
const mockUpdateSingle = vi.fn();
const mockDelete = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => table === 'storefront_notices'
        ? { order: () => mockNoticeList() }
        : mockStatsList(),
      insert: (payload: unknown) => {
        mockInsert(payload);
        return { select: () => ({ single: () => mockInsertSingle() }) };
      },
      update: (payload: unknown) => {
        mockUpdate(payload);
        return { eq: () => ({ select: () => ({ single: () => mockUpdateSingle() }) }) };
      },
      delete: () => ({ eq: (...args: unknown[]) => mockDelete(...args) }),
    }),
  },
}));

const row = {
  id: '6f8a5363-56b9-4fdd-a985-260c8f910ccb',
  internal_name: 'Legal notice',
  status: 'published',
  version: 2,
  priority: 10,
  starts_at: null,
  ends_at: null,
  audience: 'everyone',
  page_ids: ['storefront.menu'],
  frequency: 'once',
  style: 'warning',
  title: 'Important Notice',
  subtitle: '',
  body: 'Research only.',
  highlight: '',
  policy_title: '',
  policy_lines: '',
  button_label: 'Agree',
  footer_note: '',
  published_at: '2026-08-12T10:00:00.000Z',
  archived_at: null,
  created_at: '2026-08-12T09:00:00.000Z',
  updated_at: '2026-08-12T10:00:00.000Z',
};

describe('useStorefrontNoticesAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNoticeList.mockResolvedValue({ data: [row], error: null });
    mockStatsList.mockResolvedValue({
      data: [{ notice_id: row.id, version: 2, impression_count: 20, acknowledgement_count: 15 }],
      error: null,
    });
    mockInsertSingle.mockResolvedValue({ data: row, error: null });
    mockUpdateSingle.mockResolvedValue({ data: row, error: null });
    mockDelete.mockResolvedValue({ error: null });
  });

  it('loads managed notices with statistics for the current version', async () => {
    const { result } = renderHook(() => useStorefrontNoticesAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notices[0]).toEqual(expect.objectContaining({
      id: row.id,
      internalName: 'Legal notice',
      impressionCount: 20,
      acknowledgementCount: 15,
    }));
  });

  it('saves a new notice as a draft', async () => {
    const { result } = renderHook(() => useStorefrontNoticesAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.saveDraft({ ...createBlankStorefrontNotice(), internalName: 'Campaign' }));

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      internal_name: 'Campaign',
      status: 'draft',
    }));
  });

  it('publishes as a new version only when explicitly requested', async () => {
    const { result } = renderHook(() => useStorefrontNoticesAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.publishNotice({ ...DEFAULT_STOREFRONT_NOTICE, id: row.id, version: 2 }, true));

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'published',
      version: 3,
    }));
  });

  it('rejects an incomplete notice before publishing', async () => {
    const { result } = renderHook(() => useStorefrontNoticesAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.publishNotice(createBlankStorefrontNotice(), false)).rejects.toThrow(
      'Complete the required fields before publishing.',
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
