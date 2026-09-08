import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, ChevronDown, ChevronUp, HelpCircle, ArrowLeft } from 'lucide-react';
import { useFAQsAdmin, FAQItem } from '../hooks/useFAQs';

interface FAQManagerProps {
    onBack?: () => void;
}

const FAQManager: React.FC<FAQManagerProps> = ({ onBack }) => {
    const { faqs, loading, addFAQ, updateFAQ, deleteFAQ, refetch } = useFAQsAdmin();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [formData, setFormData] = useState({
        question: '',
        answer: '',
        category: 'PRODUCT & USAGE',
        order_index: 1,
        is_active: true,
    });
    const [error, setError] = useState<string | null>(null);

    const categories = [
        'PRODUCT & USAGE',
        'ORDERING & PACKAGING',
        'PAYMENT METHODS',
        'SHIPPING & DELIVERY',
    ];

    const resetForm = () => {
        setFormData({
            question: '',
            answer: '',
            category: 'PRODUCT & USAGE',
            order_index: faqs.length + 1,
            is_active: true,
        });
        setIsAdding(false);
        setEditingId(null);
        setError(null);
    };

    const saveFAQ = async () => {
        setError(null);

        try {
            if (editingId) {
                await updateFAQ(editingId, formData);
            } else {
                await addFAQ(formData);
            }
            resetForm();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save FAQ');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await saveFAQ();
    };

    const handleEdit = (faq: FAQItem) => {
        setFormData({
            question: faq.question,
            answer: faq.answer,
            category: faq.category,
            order_index: faq.order_index,
            is_active: faq.is_active,
        });
        setEditingId(faq.id);
        setIsAdding(true);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this FAQ?')) {
            try {
                await deleteFAQ(id);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to delete FAQ');
            }
        }
    };

    const toggleActive = async (faq: FAQItem) => {
        try {
            await updateFAQ(faq.id, { is_active: !faq.is_active });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to toggle FAQ status');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4 md:p-14">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors mr-2"
                            title="Go Back"
                        >
                            <ArrowLeft className="w-6 h-6 text-gray-600" />
                        </button>
                    )}
                    <HelpCircle className="w-6 h-6 text-navy-900" />
                    <h2 className="text-xl font-bold text-navy-900">FAQ Management</h2>
                </div>
                <button
                    onClick={() => {
                        resetForm();
                        setIsAdding(true);
                    }}
                    className="w-full md:w-auto flex items-center justify-center gap-2 bg-sakura-dark text-white px-4 py-2 rounded-lg hover:bg-sakura-deep transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Add FAQ
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                </div>
            )}

            {/* Add/Edit Form */}
            {isAdding && (
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900">
                            {editingId ? 'Edit FAQ' : 'Add New FAQ'}
                        </h3>
                        <button
                            type="button"
                            onClick={saveFAQ}
                            className="flex items-center gap-2 bg-sakura-dark text-white px-3 py-1.5 rounded-lg hover:bg-sakura-deep transition-colors text-sm shadow-sm"
                        >
                            <Save className="w-4 h-4" />
                            Save
                        </button>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Question *
                            </label>
                            <input
                                type="text"
                                value={formData.question}
                                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-900 focus:border-transparent text-gray-900"
                                placeholder="Enter the question"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Answer *
                            </label>
                            <textarea
                                value={formData.answer}
                                onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-900 focus:border-transparent text-gray-900"
                                placeholder="Enter the answer (supports line breaks)"
                                rows={5}
                                required
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Category *
                                </label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-900 focus:border-transparent text-gray-900"
                                >
                                    {categories.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Order
                                </label>
                                <input
                                    type="number"
                                    value={formData.order_index}
                                    onChange={(e) => setFormData({ ...formData, order_index: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-900 focus:border-transparent text-gray-900"
                                    min={1}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_active"
                                checked={formData.is_active}
                                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                className="w-4 h-4 rounded border-gray-300 text-navy-900 focus:ring-navy-900"
                            />
                            <label htmlFor="is_active" className="text-sm text-gray-700">
                                Active (visible on website)
                            </label>
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="submit"
                                className="flex items-center gap-2 bg-sakura-dark text-white px-4 py-2 rounded-lg hover:bg-sakura-deep transition-colors shadow-sm"
                            >
                                <Save className="w-4 h-4" />
                                {editingId ? 'Update FAQ' : 'Save FAQ'}
                            </button>
                            <button
                                type="button"
                                onClick={resetForm}
                                className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                <X className="w-4 h-4" />
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* FAQ List */}
            <div className="space-y-12">
                {faqs.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-xl border border-gray-200 border-dashed">
                        <HelpCircle className="w-16 h-16 text-gray-300 mx-auto mb-6" />
                        <p className="text-gray-500 text-lg">No FAQs found. Add your first FAQ above.</p>
                        <p className="text-sm text-gray-400 mt-2">
                            Note: If the FAQs table doesn't exist in Supabase, default FAQs will be shown on the website.
                        </p>
                    </div>
                ) : (
                    categories.map(category => {
                        const categoryFAQs = faqs.filter(faq => faq.category === category);
                        if (categoryFAQs.length === 0) return null;

                        return (
                            <div key={category}>
                                {/* Section Header */}
                                <div className="flex items-center gap-3 mb-8 px-5 py-4 rounded-lg border border-navy-900 bg-white shadow-sm w-full">
                                    <HelpCircle className="w-6 h-6 text-gold-500" />
                                    <h2 className="font-bold text-base md:text-lg uppercase tracking-wide text-navy-900">{category}</h2>
                                </div>

                                <div className="space-y-6">
                                    {categoryFAQs.map((faq) => (
                                        <div
                                            key={faq.id}
                                            className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 ${faq.is_active ? 'border-gray-100' : 'border-red-200 bg-red-50/10'}`}
                                        >
                                            <div className="px-5 py-5 md:px-8 md:py-6 flex flex-col md:flex-row items-start justify-between gap-4 md:gap-6">
                                                <div className="flex-1 w-full">
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <span className="text-sm font-mono text-gray-400">#{faq.order_index}</span>
                                                        {!faq.is_active && (
                                                            <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-600 font-medium">
                                                                Hidden
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h3 className="font-bold text-navy-900 text-lg md:text-xl leading-snug mb-3">
                                                        {faq.question}
                                                    </h3>
                                                    <p className="text-gray-600 whitespace-pre-line leading-relaxed text-base md:text-lg">
                                                        {faq.answer}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2 flex-shrink-0 w-full md:w-auto justify-end md:ml-6 md:self-start border-t md:border-t-0 border-gray-100 pt-4 md:pt-0 mt-2 md:mt-0">
                                                    <button
                                                        onClick={() => toggleActive(faq)}
                                                        className={`p-2.5 rounded-lg transition-colors ${faq.is_active
                                                            ? 'text-green-600 hover:bg-green-50'
                                                            : 'text-gray-400 hover:bg-gray-100'
                                                            }`}
                                                        title={faq.is_active ? 'Hide FAQ' : 'Show FAQ'}
                                                    >
                                                        {faq.is_active ? (
                                                            <ChevronUp className="w-5 h-5" />
                                                        ) : (
                                                            <ChevronDown className="w-5 h-5" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => handleEdit(faq)}
                                                        className="p-2.5 text-navy-900 hover:bg-navy-50 rounded-lg transition-colors"
                                                        title="Edit FAQ"
                                                    >
                                                        <Edit2 className="w-5 h-5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(faq.id)}
                                                        className="p-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Delete FAQ"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-medium text-blue-900 mb-2">💡 Database Setup</h4>
                <p className="text-sm text-blue-700">
                    To enable FAQ management, create a <code className="bg-blue-100 px-1 rounded">faqs</code> table in Supabase with columns:
                    <code className="block bg-blue-100 p-2 rounded mt-2 text-xs">
                        id (uuid), question (text), answer (text), category (text), order_index (int4), is_active (bool), created_at (timestamptz), updated_at (timestamptz)
                    </code>
                </p>
            </div>
        </div>
    );
};

export default FAQManager;
