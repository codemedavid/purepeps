import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Edit, Trash2, Save, ArrowLeft, Layers, Check } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { supabase } from '../lib/supabase';
import { formatPrice } from '../utils/currency';

interface TierManagerProps {
  onBack: () => void;
}

interface TierRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_all_access: boolean;
  active: boolean;
  sort_order: number;
  category_ids: string[];
}

interface RawTierRow {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  is_all_access: boolean;
  active: boolean;
  sort_order: number;
  tier_categories?: { category_id: string }[] | null;
}

const emptyForm = {
  name: '',
  description: '',
  price: 0,
  is_all_access: false,
  active: true,
  sort_order: 0,
  category_ids: [] as string[],
};

const TierManager: React.FC<TierManagerProps> = ({ onBack }) => {
  // Exclude the synthetic 'all' chip — tiers reference real categories only.
  const { categories } = useCategories();
  const realCategories = categories.filter((c) => c.id !== 'all');

  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchTiers = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tiers')
        .select('*, tier_categories ( category_id )')
        .order('sort_order', { ascending: true });
      if (error) throw error;

      const rows = ((data ?? []) as RawTierRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        price: Number(row.price) || 0,
        is_all_access: row.is_all_access,
        active: row.active,
        sort_order: row.sort_order,
        category_ids: (row.tier_categories ?? []).map((tc) => tc.category_id),
      }));
      setTiers(rows);
    } catch (err) {
      console.error('Error loading tiers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  const handleAdd = () => {
    const nextSort = Math.max(0, ...tiers.map((t) => t.sort_order)) + 1;
    setForm({ ...emptyForm, sort_order: nextSort });
    setEditingId(null);
    setView('add');
  };

  const handleEdit = (tier: TierRow) => {
    setForm({
      name: tier.name,
      description: tier.description ?? '',
      price: tier.price,
      is_all_access: tier.is_all_access,
      active: tier.active,
      sort_order: tier.sort_order,
      category_ids: tier.category_ids,
    });
    setEditingId(tier.id);
    setView('edit');
  };

  const toggleCategory = (id: string) => {
    setForm((prev) => ({
      ...prev,
      category_ids: prev.category_ids.includes(id)
        ? prev.category_ids.filter((c) => c !== id)
        : [...prev.category_ids, id],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('Please enter a tier name.');
      return;
    }
    if (form.price < 0) {
      alert('Price cannot be negative.');
      return;
    }
    if (!form.is_all_access && form.category_ids.length === 0) {
      alert('Select at least one category, or mark the tier as All Access.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: form.price,
        is_all_access: form.is_all_access,
        active: form.active,
        sort_order: form.sort_order,
      };

      let tierId = editingId;
      if (editingId) {
        const { error } = await supabase.from('tiers').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('tiers').insert(payload).select('id').single();
        if (error) throw error;
        tierId = data.id;
      }

      // Replace the tier's category set. All-access tiers carry no rows.
      if (tierId) {
        const { error: delError } = await supabase
          .from('tier_categories')
          .delete()
          .eq('tier_id', tierId);
        if (delError) throw delError;

        if (!form.is_all_access && form.category_ids.length > 0) {
          const rows = form.category_ids.map((category_id) => ({ tier_id: tierId, category_id }));
          const { error: insError } = await supabase.from('tier_categories').insert(rows);
          if (insError) throw insError;
        }
      }

      await fetchTiers();
      setView('list');
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save tier');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tier: TierRow) => {
    if (tier.is_all_access) {
      alert('The All Access tier cannot be deleted — it preserves full-catalog access.');
      return;
    }
    if (!confirm(`Delete the "${tier.name}" tier? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('tiers').delete().eq('id', tier.id);
      if (error) throw error;
      await fetchTiers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete tier');
    }
  };

  // ---- FORM VIEW --------------------------------------------------------
  if (view === 'add' || view === 'edit') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setView('list')}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-sakura-primary"
          >
            <ArrowLeft className="w-4 h-4" /> Back to tiers
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-sakura-primary text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save tier'}
          </button>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-6">
          {view === 'add' ? 'Add Tier' : 'Edit Tier'}
        </h1>

        <div className="space-y-5 bg-white border border-gray-200 rounded-xl p-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1.5">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
              placeholder="e.g., Weight Management Tier"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1.5">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
              placeholder="Short summary shown on the Get Access page"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1.5">Price (₱) *</label>
              <input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1.5">Sort order</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm font-semibold text-gray-900">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_all_access}
                onChange={(e) => setForm({ ...form, is_all_access: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm font-semibold text-gray-900">
                All Access (every category)
              </span>
            </label>
          </div>

          {!form.is_all_access && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Categories in this tier *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {realCategories.map((cat) => {
                  const checked = form.category_ids.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                        checked
                          ? 'border-sakura-primary bg-sakura-blush text-sakura-ink'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-sakura-primary/40'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center ${
                          checked ? 'bg-sakura-primary text-white' : 'bg-gray-100'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                      </span>
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- LIST VIEW --------------------------------------------------------
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-sakura-primary"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 bg-sakura-primary text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Add tier
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-5 h-5 text-sakura-primary" />
        <h1 className="text-xl font-bold text-gray-900">Access Tiers</h1>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading tiers…</div>
      ) : tiers.length === 0 ? (
        <div className="text-sm text-gray-500">No tiers yet. Add one to start.</div>
      ) : (
        <div className="space-y-3">
          {tiers.map((tier) => {
            const catNames = tier.is_all_access
              ? ['Every category']
              : tier.category_ids.map(
                  (id) => realCategories.find((c) => c.id === id)?.name ?? id,
                );
            return (
              <div
                key={tier.id}
                className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{tier.name}</span>
                    <span className="font-mono text-sakura-primary font-semibold">
                      {formatPrice(tier.price)}
                    </span>
                    {!tier.active && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                        Inactive
                      </span>
                    )}
                    {tier.is_all_access && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-sakura-blush text-sakura-deep">
                        All Access
                      </span>
                    )}
                  </div>
                  {tier.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{tier.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {catNames.map((name) => (
                      <span
                        key={name}
                        className="text-[11px] px-2 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-600"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleEdit(tier)}
                    className="p-2 text-gray-400 hover:text-sakura-primary hover:bg-sakura-blush rounded-lg"
                    title="Edit tier"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(tier)}
                    disabled={tier.is_all_access}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                    title={tier.is_all_access ? 'Cannot delete All Access' : 'Delete tier'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TierManager;
