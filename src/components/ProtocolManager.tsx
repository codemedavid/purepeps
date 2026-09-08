import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Edit, Trash2, Save, X, Eye, EyeOff, Upload, FileText, Image } from 'lucide-react';
import { useProtocols, Protocol } from '../hooks/useProtocols';
import { useImageUpload } from '../hooks/useImageUpload';
import {
    CANONICAL_PROTOCOL_CATEGORIES,
    categoryDisplayName,
    parseProtocolCategories,
    toCategorySlug,
} from '../utils/protocolCategories';

interface ProtocolManagerProps {
    onBack: () => void;
}

const ProtocolManager: React.FC<ProtocolManagerProps> = ({ onBack }) => {
    const { protocols, loading, addProtocol, updateProtocol, deleteProtocol, toggleActive } = useProtocols();
    const { uploadImage, uploading, uploadProgress } = useImageUpload('protocol-files');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const emptyForm = {
        name: '',
        category: '',
        dosage: '',
        frequency: '',
        duration: '',
        notes: [] as string[],
        storage: '',
        sort_order: 0,
        active: true,
        content_type: 'text' as 'text' | 'file' | 'image',
        file_url: null as string | null
    };

    const [formData, setFormData] = useState(emptyForm);
    const [notesText, setNotesText] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);

    /**
     * The categories offered in the form: the canonical list, plus any category
     * already in the data that is not canonical (so an older label stays
     * editable rather than silently vanishing on the next save).
     *
     * Offering a fixed list instead of a free-text box is the whole point —
     * typing "Weight Loss" a second time is how the client ended up with two of
     * them in the public dropdown.
     */
    const categoryChoices = useMemo(() => {
        const bySlug = new Map<string, string>(
            CANONICAL_PROTOCOL_CATEGORIES.map((category) => [category.slug, category.name]),
        );
        for (const protocol of protocols) {
            for (const slug of parseProtocolCategories(protocol.category)) {
                if (!bySlug.has(slug)) bySlug.set(slug, categoryDisplayName(slug));
            }
        }
        return [...bySlug.entries()].map(([slug, name]) => ({ slug, name }));
    }, [protocols]);

    const selectedCategorySlugs = parseProtocolCategories(formData.category);

    /**
     * Adds or removes one category from this protocol. The field is stored as a
     * comma list of canonical DISPLAY NAMES, so a protocol can sit in several
     * categories and every write goes back in the canonical spelling.
     */
    const toggleCategory = (slug: string) => {
        const next = selectedCategorySlugs.includes(slug)
            ? selectedCategorySlugs.filter((current) => current !== slug)
            : [...selectedCategorySlugs, slug];

        setFormData({ ...formData, category: next.map(categoryDisplayName).join(', ') });
    };

    const handleEdit = (protocol: Protocol) => {
        setEditingId(protocol.id);
        setFormData({
            name: protocol.name,
            category: protocol.category,
            dosage: protocol.dosage,
            frequency: protocol.frequency,
            duration: protocol.duration,
            notes: protocol.notes,
            storage: protocol.storage,
            sort_order: protocol.sort_order,
            active: protocol.active,
            content_type: protocol.content_type || 'text',
            file_url: protocol.file_url || null
        });
        setNotesText(protocol.notes.join('\n'));
        setFilePreview(protocol.file_url || null);
        setSelectedFile(null);
        setIsAdding(false);
    };

    const handleAdd = () => {
        setIsAdding(true);
        setEditingId(null);
        setFormData({ ...emptyForm, sort_order: protocols.length + 1 });
        setNotesText('');
        setSelectedFile(null);
        setFilePreview(null);
    };

    const handleCancel = () => {
        setEditingId(null);
        setIsAdding(false);
        setFormData(emptyForm);
        setNotesText('');
        setSelectedFile(null);
        setFilePreview(null);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);

        if (formData.content_type === 'image' && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => setFilePreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        } else {
            setFilePreview(null);
        }
    };

    const handleSave = async () => {
        if (!formData.name || toCategorySlug(formData.category) === '') {
            alert('Please fill in name and pick at least one category');
            return;
        }

        if (formData.content_type === 'text' && !formData.dosage) {
            alert('Please fill in dosage for text protocols');
            return;
        }

        if ((formData.content_type === 'file' || formData.content_type === 'image') && !selectedFile && !formData.file_url) {
            alert(`Please upload a ${formData.content_type === 'file' ? 'file' : 'image'}`);
            return;
        }

        setIsProcessing(true);
        const notes = notesText.split('\n').filter(note => note.trim() !== '');
        // Write the canonical spelling, so the same category never lands in the
        // table under two different labels.
        const category = parseProtocolCategories(formData.category)
            .map(categoryDisplayName)
            .join(', ');
        const dataToSave = { ...formData, category, notes };

        try {
            // Upload file if selected
            if (selectedFile && (formData.content_type === 'file' || formData.content_type === 'image')) {
                const uploadedUrl = await uploadImage(selectedFile);
                dataToSave.file_url = uploadedUrl;
            }

            if (isAdding) {
                const result = await addProtocol(dataToSave);
                if (!result.success) throw new Error(result.error);
            } else if (editingId) {
                const result = await updateProtocol(editingId, dataToSave);
                if (!result.success) throw new Error(result.error);
            }
            handleCancel();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this protocol?')) return;
        setIsProcessing(true);
        try {
            const result = await deleteProtocol(id);
            if (!result.success) throw new Error(result.error);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        setIsProcessing(true);
        try {
            const result = await toggleActive(id, !currentActive);
            if (!result.success) throw new Error(result.error);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to toggle');
        } finally {
            setIsProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onBack}
                                className="text-gray-500 hover:text-gray-900 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <h1 className="text-xl font-bold text-gray-900">📋 Protocol Manager</h1>
                        </div>
                        {!isAdding && !editingId && (
                            <button
                                onClick={handleAdd}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Add Protocol
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-6">
                {/* Add/Edit Form */}
                {(isAdding || editingId) && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">
                            {isAdding ? '➕ Add New Protocol' : '✏️ Edit Protocol'}
                        </h2>

                        {/* Name, Category, Sort Order */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                    placeholder="e.g., Tirzepatide"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                                <div className="flex flex-wrap gap-2" role="group" aria-label="Protocol categories">
                                    {categoryChoices.map((choice) => {
                                        const isChosen = selectedCategorySlugs.includes(choice.slug);
                                        return (
                                            <button
                                                key={choice.slug}
                                                type="button"
                                                aria-pressed={isChosen}
                                                onClick={() => toggleCategory(choice.slug)}
                                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                                                    isChosen
                                                        ? 'bg-gray-900 text-white border-gray-900'
                                                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-900'
                                                }`}
                                            >
                                                {choice.name}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Pick one or more. The public Guides filter shows each category once.
                                </p>
                            </div>
                        </div>

                        {/* Content Type Selector */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Protocol Content Type *</label>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, content_type: 'text', file_url: null });
                                        setSelectedFile(null);
                                        setFilePreview(null);
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${formData.content_type === 'text' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}
                                >
                                    <FileText className="w-4 h-4" />
                                    Text
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, content_type: 'file' });
                                        setSelectedFile(null);
                                        setFilePreview(null);
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${formData.content_type === 'file' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}
                                >
                                    <Upload className="w-4 h-4" />
                                    File
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, content_type: 'image' });
                                        setSelectedFile(null);
                                        setFilePreview(null);
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${formData.content_type === 'image' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}
                                >
                                    <Image className="w-4 h-4" />
                                    Image
                                </button>
                            </div>
                        </div>

                        {/* Text Content Fields */}
                        {formData.content_type === 'text' && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Dosage *</label>
                                        <input
                                            type="text"
                                            value={formData.dosage}
                                            onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                            placeholder="e.g., 2.5mg - 15mg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                                        <input
                                            type="text"
                                            value={formData.frequency}
                                            onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                            placeholder="e.g., Once weekly"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                                        <input
                                            type="text"
                                            value={formData.duration}
                                            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                            placeholder="e.g., 12-16 weeks"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                                        <input
                                            type="number"
                                            value={formData.sort_order}
                                            onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Storage Instructions</label>
                                    <input
                                        type="text"
                                        value={formData.storage}
                                        onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                        placeholder="e.g., Refrigerate at 2-8°C"
                                    />
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Protocol Notes (one per line)</label>
                                    <textarea
                                        value={notesText}
                                        onChange={(e) => setNotesText(e.target.value)}
                                        rows={5}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                        placeholder="Enter each note on a new line..."
                                    />
                                </div>
                            </>
                        )}

                        {/* File Upload */}
                        {formData.content_type === 'file' && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Upload File (PDF, DOC, etc.)</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all"
                                >
                                    {selectedFile ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <FileText className="w-10 h-10 text-blue-500" />
                                            <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                                            <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                                            <p className="text-xs text-green-600">Click to change file</p>
                                        </div>
                                    ) : formData.file_url ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <FileText className="w-10 h-10 text-blue-500" />
                                            <p className="text-sm font-medium text-gray-900">File already uploaded</p>
                                            <a href={formData.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline" onClick={(e) => e.stopPropagation()}>
                                                View current file
                                            </a>
                                            <p className="text-xs text-gray-500 mt-1">Click to upload a new file</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <Upload className="w-10 h-10 text-gray-400" />
                                            <p className="text-sm text-gray-600">Click to upload a file</p>
                                            <p className="text-xs text-gray-400">PDF, DOC, DOCX, TXT, XLS, XLSX</p>
                                        </div>
                                    )}
                                </div>
                                {uploading && (
                                    <div className="mt-3">
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div className="bg-gray-900 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1 text-center">Uploading... {uploadProgress}%</p>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                                        <input
                                            type="number"
                                            value={formData.sort_order}
                                            onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Image Upload */}
                        {formData.content_type === 'image' && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Upload Image</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all"
                                >
                                    {filePreview || (formData.file_url && !selectedFile) ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <img
                                                src={filePreview || formData.file_url || ''}
                                                alt="Protocol preview"
                                                className="max-w-xs max-h-48 rounded-lg object-contain"
                                            />
                                            <p className="text-xs text-gray-500 mt-2">Click to change image</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <Image className="w-10 h-10 text-gray-400" />
                                            <p className="text-sm text-gray-600">Click to upload an image</p>
                                            <p className="text-xs text-gray-400">JPG, PNG, WebP, GIF, etc.</p>
                                        </div>
                                    )}
                                </div>
                                {uploading && (
                                    <div className="mt-3">
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div className="bg-gray-900 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1 text-center">Uploading... {uploadProgress}%</p>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                                        <input
                                            type="number"
                                            value={formData.sort_order}
                                            onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-2 mb-4">
                            <input
                                type="checkbox"
                                id="active"
                                checked={formData.active}
                                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                className="w-4 h-4 text-gray-900 rounded focus:ring-gray-900"
                            />
                            <label htmlFor="active" className="text-sm font-medium text-gray-700">Active (visible on website)</label>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleSave}
                                disabled={isProcessing || uploading}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                {uploading ? 'Uploading...' : isProcessing ? 'Saving...' : 'Save Protocol'}
                            </button>
                            <button
                                onClick={handleCancel}
                                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                <X className="w-4 h-4" />
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Protocols List */}
                <div className="space-y-3">
                    {protocols.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                            <p className="text-gray-500">No protocols yet. Add your first protocol!</p>
                        </div>
                    ) : (
                        protocols.map((protocol) => (
                            <div
                                key={protocol.id}
                                className={`bg-white rounded-xl shadow-sm border ${protocol.active ? 'border-gray-200' : 'border-red-200 bg-red-50/30'} p-4`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-medium text-rose-500 uppercase tracking-wider">{protocol.category}</span>
                                            {protocol.content_type === 'file' && (
                                                <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded flex items-center gap-1">
                                                    <FileText className="w-3 h-3" /> File
                                                </span>
                                            )}
                                            {protocol.content_type === 'image' && (
                                                <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-0.5 rounded flex items-center gap-1">
                                                    <Image className="w-3 h-3" /> Image
                                                </span>
                                            )}
                                            {!protocol.active && (
                                                <span className="text-xs font-medium text-red-500 bg-red-100 px-2 py-0.5 rounded">Hidden</span>
                                            )}
                                        </div>
                                        <h3 className="font-semibold text-gray-900">{protocol.name}</h3>
                                        {protocol.content_type === 'text' ? (
                                            <p className="text-sm text-gray-600 mt-1">
                                                {protocol.dosage} • {protocol.frequency}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-gray-500 mt-1">
                                                {protocol.content_type === 'file' ? 'File attached' : 'Image attached'}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleToggleActive(protocol.id, protocol.active)}
                                            disabled={isProcessing}
                                            className={`p-2 rounded-lg transition-colors ${protocol.active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                            title={protocol.active ? 'Hide from website' : 'Show on website'}
                                        >
                                            {protocol.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        </button>
                                        <button
                                            onClick={() => handleEdit(protocol)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Edit"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(protocol.id)}
                                            disabled={isProcessing}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProtocolManager;
