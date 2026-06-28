import React, { useState } from 'react';
import { Plus, Edit, Trash2, Save, X, Package } from 'lucide-react';
import type { Product, ProductVariation } from '../types';
import { useMenu } from '../hooks/useMenu';
import { MoneyInput } from './MoneyInput';

interface VariationManagerProps {
  product: Product;
  onClose: () => void;
  onUpdate: () => void;
}

const VariationManager: React.FC<VariationManagerProps> = ({ product, onClose, onUpdate }) => {
  const { addVariation, updateVariation, deleteVariation } = useMenu();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [newVariation, setNewVariation] = useState({
    name: '',
    quantity_mg: 5.0,
    price: product.base_price,
    discount_price: null as number | null,
    discount_active: false,
    stock_quantity: 0
  });

  const [editingVariation, setEditingVariation] = useState({
    name: '',
    quantity_mg: 5.0,
    price: product.base_price,
    discount_price: null as number | null,
    discount_active: false,
    stock_quantity: 0
  });

  const handleAddVariation = async () => {
    if (!newVariation.name || newVariation.price <= 0 || newVariation.quantity_mg <= 0) {
      alert('Please fill in all fields correctly');
      return;
    }

    try {
      setIsProcessing(true);
      const result = await addVariation({
        product_id: product.id,
        name: newVariation.name,
        quantity_mg: newVariation.quantity_mg,
        price: newVariation.price,
        discount_price: newVariation.discount_price,
        discount_active: newVariation.discount_active,
        stock_quantity: newVariation.stock_quantity
      });

      if (result.success) {
        setNewVariation({
          name: '',
          quantity_mg: 5.0,
          price: product.base_price,
          discount_price: null,
          discount_active: false,
          stock_quantity: 0
        });
        setIsAdding(false);
        alert('Variation added successfully!');
        onUpdate();
      } else {
        alert(result.error || 'Failed to add variation');
      }
    } catch (error) {
      alert('Failed to add variation');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditVariation = (variation: ProductVariation) => {
    setEditingId(variation.id);
    setEditingVariation({
      name: variation.name,
      quantity_mg: variation.quantity_mg,
      price: variation.price,
      discount_price: variation.discount_price,
      discount_active: variation.discount_active,
      stock_quantity: variation.stock_quantity
    });
    setIsAdding(false);
  };

  const handleUpdateVariation = async () => {
    if (!editingId || !editingVariation.name || editingVariation.price <= 0 || editingVariation.quantity_mg <= 0) {
      alert('Please fill in all fields correctly');
      return;
    }

    try {
      setIsProcessing(true);
      const result = await updateVariation(editingId, editingVariation);
      if (result.success) {
        setEditingId(null);
        alert('Variation updated successfully!');
        onUpdate();
      } else {
        alert(result.error || 'Failed to update variation');
      }
    } catch (error) {
      alert('Failed to update variation');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteVariation = async (id: string, name: string) => {
    if (!confirm(`Delete ${name} variation? This cannot be undone.`)) return;

    try {
      setIsProcessing(true);
      const result = await deleteVariation(id);
      if (result.success) {
        alert('Variation deleted successfully!');
        onUpdate();
      } else {
        alert(result.error || 'Failed to delete variation');
      }
    } catch (error) {
      alert('Failed to delete variation');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 text-white p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
                <Package className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
                <span className="truncate">Manage Size Variations</span>
              </h2>
              <p className="text-gray-300 mt-1 text-sm sm:text-base truncate">Product: {product.name}</p>
              <p className="text-gray-400 text-xs sm:text-sm mt-2 bg-gray-800 px-3 py-1.5 rounded-lg inline-block">
                💡 <strong>These prices</strong> are what customers see!
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6 overflow-y-auto max-h-[calc(95vh-200px)] sm:max-h-[calc(90vh-180px)]">
          {/* Current Variations */}
          <div className="mb-4 sm:mb-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              Current Sizes
              <span className="text-xs sm:text-sm font-normal text-gray-500">
                ({product.variations?.length || 0} variations)
              </span>
            </h3>

            {!product.variations || product.variations.length === 0 ? (
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 sm:p-8 text-center">
                <Package className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium text-sm sm:text-base">No size variations yet</p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">Add your first size option below</p>
              </div>
            ) : (
              <div className="space-y-3">
                {product.variations.map((variation) => (
                  <div key={variation.id}>
                    {editingId === variation.id ? (
                      // Edit Mode
                      <div className="bg-white border-2 border-gray-900 rounded-xl p-3 sm:p-4 space-y-4">
                        <h4 className="font-bold text-gray-900 text-sm sm:text-base mb-3 sm:mb-4">Edit Variation</h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                              Size Name *
                            </label>
                            <input
                              type="text"
                              value={editingVariation.name}
                              onChange={(e) => setEditingVariation({ ...editingVariation, name: e.target.value })}
                              className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                            />
                          </div>

                          <div>
                            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                              Quantity (mg) *
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              value={editingVariation.quantity_mg}
                              onChange={(e) => setEditingVariation({ ...editingVariation, quantity_mg: parseFloat(e.target.value) || 0 })}
                              className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                            />
                          </div>

                          <div>
                            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                              Price (₱) *
                            </label>
                            <MoneyInput
                              value={editingVariation.price}
                              onChange={(price) => setEditingVariation({ ...editingVariation, price: price ?? 0 })}
                              className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                            />
                          </div>

                          <div>
                            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                              Stock Quantity *
                            </label>
                            <input
                              type="number"
                              value={editingVariation.stock_quantity}
                              onChange={(e) => setEditingVariation({ ...editingVariation, stock_quantity: parseInt(e.target.value) || 0 })}
                              className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                            />
                          </div>

                          <div>
                            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                              Discount Price (₱)
                            </label>
                            <MoneyInput
                              value={editingVariation.discount_price}
                              allowEmpty
                              onChange={(discount_price) => setEditingVariation({ ...editingVariation, discount_price })}
                              className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                              placeholder="Leave empty for no discount"
                            />
                          </div>

                          <div className="flex items-center pt-0 sm:pt-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingVariation.discount_active}
                                onChange={(e) => setEditingVariation({
                                  ...editingVariation,
                                  discount_active: e.target.checked,
                                  discount_price: e.target.checked ? editingVariation.discount_price : null
                                })}
                                className="w-4 h-4 text-gray-900 rounded focus:ring-gray-900"
                              />
                              <span className="text-xs sm:text-sm font-semibold text-gray-700">🏷️ Enable Discount</span>
                            </label>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4">
                          <button
                            onClick={handleUpdateVariation}
                            disabled={isProcessing}
                            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg sm:rounded-xl font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50 text-sm sm:text-base"
                          >
                            <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                            Save Changes
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            disabled={isProcessing}
                            className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg sm:rounded-xl font-medium transition-all text-sm sm:text-base"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View Mode - Responsive Card
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                          {/* Mobile: Stack layout, Desktop: Grid layout */}
                          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                            <div>
                              <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1">Size Name</div>
                              <div className="font-bold text-gray-900 text-sm sm:text-base">{variation.name}</div>
                            </div>
                            <div>
                              <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1">Quantity</div>
                              <div className="font-semibold text-gray-700 text-sm sm:text-base">{variation.quantity_mg}mg</div>
                            </div>
                            <div>
                              <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1">Price</div>
                              <div className="font-semibold text-gray-900 text-sm sm:text-base">₱{variation.price.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1">Stock</div>
                              <div className="font-semibold text-gray-700 text-sm sm:text-base">{variation.stock_quantity} units</div>
                            </div>
                          </div>
                          {/* Action buttons */}
                          <div className="flex gap-2 justify-end sm:justify-start pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200 sm:ml-auto">
                            <button
                              onClick={() => handleEditVariation(variation)}
                              disabled={isProcessing}
                              className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 border border-gray-300"
                              title="Edit variation"
                            >
                              <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteVariation(variation.id, variation.name)}
                              disabled={isProcessing}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 border border-red-200"
                              title="Delete variation"
                            >
                              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add New Variation */}
          <div className="border-t-2 border-gray-200 pt-4 sm:pt-6">
            <button
              onClick={() => {
                setIsAdding(!isAdding);
                setEditingId(null); // Close edit mode when adding new
              }}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg mb-3 sm:mb-4 text-sm sm:text-base"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              {isAdding ? 'Cancel' : 'Add New Size'}
            </button>

            {isAdding && (
              <div className="bg-white border-2 border-gray-900 rounded-xl p-3 sm:p-6 space-y-4">
                <h4 className="font-bold text-gray-900 text-sm sm:text-base mb-3 sm:mb-4">New Size Variation</h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                      Size Name *
                    </label>
                    <input
                      type="text"
                      value={newVariation.name}
                      onChange={(e) => setNewVariation({ ...newVariation, name: e.target.value })}
                      placeholder="e.g., 5mg, 10mg, 20mg"
                      className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                      Quantity (mg) *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={newVariation.quantity_mg}
                      onChange={(e) => setNewVariation({ ...newVariation, quantity_mg: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                      Price (₱) *
                    </label>
                    <MoneyInput
                      value={newVariation.price}
                      onChange={(price) => setNewVariation({ ...newVariation, price: price ?? 0 })}
                      className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                      Stock Quantity *
                    </label>
                    <input
                      type="number"
                      value={newVariation.stock_quantity}
                      onChange={(e) => setNewVariation({ ...newVariation, stock_quantity: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 sm:mb-2">
                      Discount Price (₱)
                    </label>
                    <MoneyInput
                      value={newVariation.discount_price}
                      allowEmpty
                      onChange={(discount_price) => setNewVariation({ ...newVariation, discount_price })}
                      className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                      placeholder="Leave empty for no discount"
                    />
                  </div>

                  <div className="flex items-center pt-0 sm:pt-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newVariation.discount_active}
                        onChange={(e) => setNewVariation({
                          ...newVariation,
                          discount_active: e.target.checked,
                          discount_price: e.target.checked ? newVariation.discount_price : null
                        })}
                        className="w-4 h-4 text-gray-900 rounded focus:ring-gray-900"
                      />
                      <span className="text-xs sm:text-sm font-semibold text-gray-700">🏷️ Enable Discount</span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4">
                  <button
                    onClick={handleAddVariation}
                    disabled={isProcessing}
                    className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg sm:rounded-xl font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50 text-sm sm:text-base"
                  >
                    <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                    Save Variation
                  </button>
                  <button
                    onClick={() => setIsAdding(false)}
                    disabled={isProcessing}
                    className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg sm:rounded-xl font-medium transition-all text-sm sm:text-base"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 border-t border-gray-200 p-3 sm:p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg sm:rounded-xl font-medium transition-all text-sm sm:text-base"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default VariationManager;
