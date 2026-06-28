import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCategories } from './useCategories';
import { resetAllSharedResources } from '../lib/sharedResource';

// Build mock chain: supabase.from('categories').select('*').eq('active', true).order(...)
const mockOrder = vi.fn();
const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
const mockEq = vi.fn().mockReturnValue({ order: mockOrder, limit: mockLimit });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockInsertSingle = vi.fn();
const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockInsertSingle }) });
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });
const mockDeleteEq = vi.fn().mockResolvedValue({ error: null });
const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq });

const mockCategories = [
  { id: 'cat-1', name: 'Weight Management', icon: 'Scale', sort_order: 1, active: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'cat-2', name: 'Recovery & Healing', icon: 'Heart', sort_order: 2, active: true, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
];

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};

// Use lazy arrow functions to avoid hoisting issues
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: (...args: unknown[]) => mockSelect(...args),
      insert: (...args: unknown[]) => mockInsert(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    }),
    channel: () => mockChannel,
    removeChannel: vi.fn(),
  },
}));

describe('useCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllSharedResources(); // clear the module-level cache between tests
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ order: mockOrder, limit: mockLimit });
    mockOrder.mockResolvedValue({ data: mockCategories, error: null });
    mockInsertSingle.mockResolvedValue({ data: { id: 'new-cat' }, error: null });
    mockInsert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockInsertSingle }) });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });
    mockUpdateEq.mockResolvedValue({ error: null });
    mockDelete.mockReturnValue({ eq: mockDeleteEq });
    mockDeleteEq.mockResolvedValue({ error: null });
  });

  // --- fetchCategories ---

  describe('fetchCategories', () => {
    it('fetches categories on mount and prepends "All Peptides"', async () => {
      const { result } = renderHook(() => useCategories());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.categories).toHaveLength(3); // "All Peptides" + 2
      expect(result.current.categories[0].id).toBe('all');
      expect(result.current.categories[0].name).toBe('All Peptides');
      expect(result.current.categories[1].name).toBe('Weight Management');
      expect(result.current.categories[2].name).toBe('Recovery & Healing');
    });

    it('does not duplicate "All Peptides" if it already exists in DB', async () => {
      const categoriesWithAll = [
        { id: 'all', name: 'All Peptides', icon: 'Grid', sort_order: 0, active: true, created_at: '', updated_at: '' },
        ...mockCategories,
      ];
      mockOrder.mockResolvedValueOnce({ data: categoriesWithAll, error: null });

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const allEntries = result.current.categories.filter(c => c.id === 'all');
      expect(allEntries).toHaveLength(1);
      expect(result.current.categories).toHaveLength(3);
    });

    it('sets error on fetch failure', async () => {
      mockOrder.mockResolvedValueOnce({ data: null, error: new Error('DB connection failed') });

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('DB connection failed');
    });

    it('handles empty response', async () => {
      mockOrder.mockResolvedValueOnce({ data: [], error: null });

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should still have "All Peptides"
      expect(result.current.categories).toHaveLength(1);
      expect(result.current.categories[0].id).toBe('all');
    });

    it('handles null data response', async () => {
      mockOrder.mockResolvedValueOnce({ data: null, error: null });

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.categories).toHaveLength(1);
      expect(result.current.categories[0].id).toBe('all');
    });
  });

  // --- addCategory ---

  describe('addCategory', () => {
    it('inserts a new category', async () => {
      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newCat = { id: 'cat-3', name: 'Skin Care', icon: 'Star', sort_order: 3, active: true };
      await result.current.addCategory(newCat);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Skin Care', icon: 'Star' })
      );
    });

    it('throws on insert error', async () => {
      mockInsertSingle.mockResolvedValueOnce({ data: null, error: new Error('Insert failed') });

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        result.current.addCategory({ id: 'bad', name: 'Bad', icon: 'X', sort_order: 99, active: true })
      ).rejects.toThrow('Insert failed');
    });
  });

  // --- updateCategory ---

  describe('updateCategory', () => {
    it('updates a category by id', async () => {
      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await result.current.updateCategory('cat-1', { name: 'Updated Name' });

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated Name' }));
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'cat-1');
    });
  });

  // --- deleteCategory ---

  describe('deleteCategory', () => {
    it('deletes a category by id', async () => {
      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await result.current.deleteCategory('cat-1');

      expect(mockDeleteEq).toHaveBeenCalledWith('id', 'cat-1');
    });
  });
});
