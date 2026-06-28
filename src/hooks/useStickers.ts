import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Sticker } from '../types';

/**
 * Loads sticker designs. The storefront checkout filters to `is_active` rows;
 * the admin manager works on the full list. Mirrors useCouriers so the CRUD
 * surface and storefront share one source of truth.
 */
export const useStickers = () => {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStickers = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('stickers')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setStickers(data || []);
    } catch (error) {
      // The sticker offer is non-essential — never block checkout if the table
      // is missing or unreadable. Fall back to "no stickers offered".
      console.error('Error fetching stickers:', error);
      setStickers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const addSticker = async (sticker: Omit<Sticker, 'id' | 'created_at'>) => {
    try {
      const { data, error } = await supabase
        .from('stickers')
        .insert([sticker])
        .select()
        .single();

      if (error) throw error;
      setStickers((prev) => [...prev, data]);
      return data;
    } catch (error) {
      console.error('Error adding sticker:', error);
      throw error;
    }
  };

  const updateSticker = async (id: string, updates: Partial<Sticker>) => {
    try {
      const { data, error } = await supabase
        .from('stickers')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) throw error;
      if (data && data.length > 0) {
        setStickers((prev) => prev.map((s) => (s.id === id ? data[0] : s)));
        return data[0];
      }
    } catch (error) {
      console.error('Error updating sticker:', error);
      throw error;
    }
  };

  const deleteSticker = async (id: string) => {
    try {
      const { error } = await supabase.from('stickers').delete().eq('id', id);

      if (error) throw error;
      setStickers((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error('Error deleting sticker:', error);
      throw error;
    }
  };

  useEffect(() => {
    fetchStickers();
  }, [fetchStickers]);

  return {
    stickers,
    loading,
    addSticker,
    updateSticker,
    deleteSticker,
    refetch: fetchStickers,
  };
};
