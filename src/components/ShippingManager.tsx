import React, { useState } from 'react';
import { MapPin, Edit2, Save, X, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useShippingLocationsAdmin, ShippingLocation } from '../hooks/useShippingLocations';
import { useCouriers } from '../hooks/useCouriers';

interface ShippingManagerProps {
    onBack: () => void;
}

const ShippingManager: React.FC<ShippingManagerProps> = ({ onBack }) => {
    const { locations, loading, error, updateLocation, addLocation, deleteLocation, refetch } = useShippingLocationsAdmin();
    const { couriers } = useCouriers();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editFee, setEditFee] = useState<number>(0);
    const [editName, setEditName] = useState<string>('');
    const [editCourierId, setEditCourierId] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [newLocation, setNewLocation] = useState<{ id: string; name: string; fee: number; is_active: boolean; courier_id: string | null }>({ id: '', name: '', fee: 0, is_active: true, courier_id: null });
    const [saveError, setSaveError] = useState<string | null>(null);

    const courierName = (courierId: string | null): string =>
        couriers.find(c => c.id === courierId)?.name ?? 'Unassigned';

    const handleEdit = (location: ShippingLocation) => {
        setEditingId(location.id);
        setEditFee(location.fee);
        setEditName(location.name);
        setEditCourierId(location.courier_id);
        setSaveError(null);
    };

    const handleSave = async (id: string) => {
        try {
            setSaveError(null);
            await updateLocation(id, { fee: editFee, name: editName, courier_id: editCourierId });
            setEditingId(null);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to save');
        }
    };

    const handleCancel = () => {
        setEditingId(null);
        setSaveError(null);
    };

    const handleAddNew = async () => {
        if (!newLocation.id || !newLocation.name) {
            setSaveError('ID and name are required');
            return;
        }
        if (!newLocation.courier_id) {
            setSaveError('Please select a courier for this rate');
            return;
        }
        try {
            setSaveError(null);
            await addLocation(newLocation);
            setIsAdding(false);
            setNewLocation({ id: '', name: '', fee: 0, is_active: true, courier_id: null });
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to add location');
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this shipping location?')) {
            try {
                await deleteLocation(id);
            } catch (err) {
                setSaveError(err instanceof Error ? err.message : 'Failed to delete');
            }
        }
    };

    const handleToggleActive = async (location: ShippingLocation) => {
        try {
            await updateLocation(location.id, { is_active: !location.is_active });
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to update');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
            {/* Header */}
            <div className="bg-white shadow-md border-b border-navy-700/30">
                <div className="max-w-4xl mx-auto px-3 sm:px-4">
                    <div className="flex items-center justify-between h-12 md:h-14">
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={onBack}
                                className="text-gray-700 hover:text-gold-600 transition-colors flex items-center gap-1 group"
                            >
                                <span className="text-xs md:text-sm">← Dashboard</span>
                            </button>
                            <h1 className="text-sm md:text-base font-bold text-navy-900 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-gold-500" />
                                Shipping Locations
                            </h1>
                        </div>
                        <button
                            onClick={() => setIsAdding(true)}
                            className="bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-black px-3 py-1.5 rounded-md font-medium text-xs shadow-sm flex items-center gap-1"
                        >
                            <Plus className="w-3 h-3" />
                            Add New
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4">
                {/* Error Messages */}
                {(error || saveError) && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {error || saveError}
                    </div>
                )}

                {/* Database Setup Info */}
                {locations.length === 0 && !error && (
                    <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <h4 className="font-medium text-blue-900 mb-2">💡 Database Setup</h4>
                        <p className="text-sm text-blue-700">
                            To enable shipping location management, run the migration file:
                            <code className="block bg-blue-100 p-2 rounded mt-2 text-xs">
                                supabase/migrations/20250109000000_create_shipping_locations.sql
                            </code>
                        </p>
                    </div>
                )}

                {/* Add New Form */}
                {isAdding && (
                    <div className="mb-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <h3 className="font-semibold text-gray-900 mb-3">Add New Shipping Location</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Courier</label>
                                <select
                                    value={newLocation.courier_id ?? ''}
                                    onChange={(e) => setNewLocation({ ...newLocation, courier_id: e.target.value || null })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black bg-white"
                                >
                                    <option value="">Select courier…</option>
                                    {couriers.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">ID (e.g., CEBU)</label>
                                <input
                                    type="text"
                                    value={newLocation.id}
                                    onChange={(e) => setNewLocation({ ...newLocation, id: e.target.value.toUpperCase() })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black"
                                    placeholder="LOCATION_ID"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Display Name</label>
                                <input
                                    type="text"
                                    value={newLocation.name}
                                    onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black"
                                    placeholder="Location Name"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Fee (₱)</label>
                                <input
                                    type="number"
                                    value={newLocation.fee}
                                    onChange={(e) => setNewLocation({ ...newLocation, fee: Number(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black"
                                    min={0}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={handleAddNew}
                                className="bg-brand-400 text-white px-4 py-2 rounded-lg text-sm font-medium"
                            >
                                Add Location
                            </button>
                            <button
                                onClick={() => { setIsAdding(false); setSaveError(null); }}
                                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Locations List */}
                <div className="space-y-3">
                    {locations.map((location) => (
                        <div
                            key={location.id}
                            className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${location.is_active ? 'border-gray-200' : 'border-red-200 bg-red-50/30'
                                }`}
                        >
                            {editingId === location.id ? (
                                <div className="flex flex-col md:flex-row gap-3">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black"
                                        />
                                    </div>
                                    <div className="w-full md:w-48">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Courier</label>
                                        <select
                                            value={editCourierId ?? ''}
                                            onChange={(e) => setEditCourierId(e.target.value || null)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black bg-white"
                                        >
                                            <option value="">Unassigned</option>
                                            {couriers.map((c) => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-32">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Fee (₱)</label>
                                        <input
                                            type="number"
                                            value={editFee}
                                            onChange={(e) => setEditFee(Number(e.target.value))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black"
                                            min={0}
                                        />
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <button
                                            onClick={() => handleSave(location.id)}
                                            className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                                        >
                                            <Save className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={handleCancel}
                                            className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">
                                                    {location.id}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded ${location.courier_id ? 'bg-brand-50 text-brand-600' : 'bg-amber-100 text-amber-700'}`}>
                                                    {courierName(location.courier_id)}
                                                </span>
                                                {!location.is_active && (
                                                    <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-600">
                                                        Disabled
                                                    </span>
                                                )}
                                            </div>
                                            <p className="font-medium text-gray-900 mt-1">{location.name}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-brand-400">
                                            ₱{location.fee.toLocaleString()}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleToggleActive(location)}
                                                className={`p-2 rounded-lg transition-colors ${location.is_active
                                                    ? 'text-green-600 hover:bg-green-50'
                                                    : 'text-gray-400 hover:bg-gray-100'
                                                    }`}
                                                title={location.is_active ? 'Disable' : 'Enable'}
                                            >
                                                {location.is_active ? '✓' : '○'}
                                            </button>
                                            <button
                                                onClick={() => handleEdit(location)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(location.id)}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Info */}
                <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <h4 className="font-medium text-gray-900 mb-2">ℹ️ How it works</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Changes to shipping fees take effect immediately on the checkout page</li>
                        <li>• Disabled locations won't appear in checkout</li>
                        <li>• The ID is used internally (e.g., NCR, LUZON)</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default ShippingManager;
