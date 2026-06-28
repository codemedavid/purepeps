import { supabase } from '../lib/supabase';
import { createSharedResource } from '../lib/sharedResource';
import { useSharedResource } from './useSharedResource';

export interface Category {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const ALL_CATEGORY: Category = {
  id: 'all',
  name: 'All Peptides',
  icon: 'Grid',
  sort_order: 0,
  active: true,
  created_at: '1970-01-01T00:00:00.000Z',
  updated_at: '1970-01-01T00:00:00.000Z',
};

async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  const rows = data ?? [];
  // Storefront always offers an "All" pseudo-category; synthesize it if the DB
  // doesn't already define one so filtering by "all" works everywhere.
  return rows.some((cat) => cat.id === 'all') ? rows : [ALL_CATEGORY, ...rows];
}

// One module-level cache shared by every useCategories consumer (SubNav, Menu,
// GetAccess, admin). Previously each instance fetched independently and opened
// its own realtime channel; now there is a single fetch and a single channel.
const categoriesResource = createSharedResource<Category[]>({
  fetcher: fetchCategories,
  initial: [],
  onActive: (refresh) => {
    const channel = supabase
      .channel('categories-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },
});

const addCategory = async (category: Omit<Category, 'created_at' | 'updated_at'>) => {
  const { data, error } = await supabase
    .from('categories')
    .insert({
      id: category.id,
      name: category.name,
      icon: category.icon,
      sort_order: category.sort_order,
      active: category.active,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding category:', error);
    throw error;
  }

  await categoriesResource.refresh();
  return data;
};

const updateCategory = async (id: string, updates: Partial<Category>) => {
  const { error } = await supabase
    .from('categories')
    .update({
      name: updates.name,
      icon: updates.icon,
      sort_order: updates.sort_order,
      active: updates.active,
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating category:', error);
    throw error;
  }

  await categoriesResource.refresh();
};

const deleteCategory = async (id: string) => {
  // Block deletion of a category that still has products attached.
  const { data: products, error: checkError } = await supabase
    .from('products')
    .select('id')
    .eq('category', id)
    .limit(1);

  if (checkError) {
    console.error('Error deleting category:', checkError);
    throw checkError;
  }

  if (products && products.length > 0) {
    throw new Error(
      'Cannot delete category that contains products. Please move or delete the products first.',
    );
  }

  const { error: deleteError } = await supabase.from('categories').delete().eq('id', id);

  if (deleteError) {
    console.error('Error deleting category:', deleteError);
    throw deleteError;
  }

  await categoriesResource.refresh();
};

const reorderCategories = async (reorderedCategories: Category[]) => {
  const updates = reorderedCategories.map((cat, index) => ({
    id: cat.id,
    sort_order: index + 1,
  }));

  try {
    await Promise.all(
      updates.map((update) =>
        supabase.from('categories').update({ sort_order: update.sort_order }).eq('id', update.id),
      ),
    );
    await categoriesResource.refresh();
  } catch (err) {
    console.error('Error reordering categories:', err);
    throw err;
  }
};

export const useCategories = () => {
  const { data: categories, loading, error } = useSharedResource(categoriesResource);

  return {
    categories,
    loading,
    error,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    refetch: categoriesResource.refresh,
  };
};
