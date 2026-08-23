import React, { useState } from 'react';
import CodToggle from './checkout/CodToggle';
import { Plus, Edit, Trash2, Save, X, ArrowLeft, CreditCard, Upload } from 'lucide-react';
import { usePaymentMethods, PaymentMethod } from '../hooks/usePaymentMethods';
import ImageUpload from './ImageUpload';

interface PaymentMethodManagerProps {
  onBack: () => void;
}

const PaymentMethodManager: React.FC<PaymentMethodManagerProps> = ({ onBack }) => {
  const { paymentMethods, addPaymentMethod, updatePaymentMethod, deletePaymentMethod, refetchAll } = usePaymentMethods();
  const [currentView, setCurrentView] = useState<'list' | 'add' | 'edit'>('list');
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    account_number: '',
    account_name: '',
    qr_code_url: '',
    active: true,
    sort_order: 0
  });

  React.useEffect(() => {
    refetchAll();
  }, []);

  const handleAddMethod = () => {
    const nextSortOrder = Math.max(...paymentMethods.map(m => m.sort_order), 0) + 1;
    setFormData({
      id: '',
      name: '',
      account_number: '',
      account_name: '',
      qr_code_url: '',
      active: true,
      sort_order: nextSortOrder
    });
    setCurrentView('add');
  };

  const handleEditMethod = (method: PaymentMethod) => {
    setEditingMethod(method);
    setFormData({
      id: method.id,
      name: method.name,
      account_number: method.account_number,
      account_name: method.account_name,
      qr_code_url: method.qr_code_url,
      active: method.active,
      sort_order: method.sort_order
    });
    setCurrentView('edit');
  };

  const handleDeleteMethod = async (id: string) => {
    if (confirm('Are you sure you want to delete this payment method?')) {
      try {
        await deletePaymentMethod(id);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Failed to delete payment method');
      }
    }
  };

  const handleSaveMethod = async () => {
    if (!formData.name || !formData.account_number || !formData.account_name) {
      alert('Please fill in all required fields (Name, Account Number, and Account Name)');
      return;
    }

    // QR code is optional - if missing, a placeholder will be used
    // (Database requires NOT NULL, so we use a placeholder image)

    try {
      // Generate UUID for new payment methods
      const methodId = editingMethod ? editingMethod.id : crypto.randomUUID();

      // Prepare data for saving - ensure qr_code_url is properly formatted
      const saveData = {
        ...formData,
        id: methodId,
        qr_code_url: formData.qr_code_url?.trim() || '', // Normalize qr_code_url
      };

      console.log('💾 Saving payment method:', {
        id: saveData.id,
        name: saveData.name,
        qr_code_url: saveData.qr_code_url,
        qr_code_url_length: saveData.qr_code_url.length,
      });

      if (editingMethod) {
        await updatePaymentMethod(editingMethod.id, saveData);
      } else {
        await addPaymentMethod(saveData);
      }

      console.log('✅ Payment method saved successfully');
      setCurrentView('list');
      setEditingMethod(null);
    } catch (error) {
      console.error('❌ Error saving payment method:', error);
      alert(error instanceof Error ? error.message : 'Failed to save payment method');
    }
  };

  const handleCancel = () => {
    setCurrentView('list');
    setEditingMethod(null);
  };

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name
    });
  };

  // Form View (Add/Edit)
  if (currentView === 'add' || currentView === 'edit') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
        <div className="bg-white shadow-md border-b border-navy-700/30">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 py-3 sm:py-0 sm:h-16">
              <div className="flex items-center space-x-2 sm:space-x-4 w-full sm:w-auto">
                <button
                  onClick={handleCancel}
                  className="flex items-center space-x-1 sm:space-x-2 text-gray-700 hover:text-amber-600 transition-colors duration-200"
                >
                  <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="text-sm sm:text-base">Back</span>
                </button>
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-navy-900">
                  {currentView === 'add' ? 'Add Payment Method' : 'Edit Payment Method'}
                </h1>
              </div>
              <div className="flex space-x-2 sm:space-x-3 w-full sm:w-auto">
                <button
                  onClick={handleCancel}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200 flex items-center justify-center space-x-1 sm:space-x-2 text-sm sm:text-base"
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline">Cancel</span>
                </button>
                <button
                  onClick={handleSaveMethod}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-all duration-200 flex items-center justify-center space-x-1 sm:space-x-2 shadow-lg hover:shadow-xl border border-gray-900/20 text-sm sm:text-base"
                >
                  <Save className="h-4 w-4" />
                  <span>Save</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border-2 border-navy-700/30 p-4 sm:p-6 md:p-8">
            <div className="space-y-4 sm:space-y-6">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-900 mb-1.5 sm:mb-2">Payment Method Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-gray-900 transition-colors text-gray-900"
                  placeholder="e.g., GCash, Maya, Bank Transfer"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-900 mb-1.5 sm:mb-2">Account Number/Phone *</label>
                <input
                  type="text"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-gray-900 transition-colors text-gray-900"
                  placeholder="09XX XXX XXXX or Account: 1234-5678-9012"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-900 mb-1.5 sm:mb-2">Account Name *</label>
                <input
                  type="text"
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-gray-900 transition-colors text-gray-900"
                  placeholder="SLIMMETRY"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-900 mb-1.5 sm:mb-2">
                  QR Code Image (Optional)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Upload a QR code image or paste an image URL. If upload fails, you can use the URL input below.
                </p>
                <ImageUpload
                  currentImage={formData.qr_code_url || undefined}
                  onImageChange={(imageUrl) => {
                    // Normalize value: undefined/null → empty string, non-empty string → trimmed URL
                    let newQrCodeUrl: string = '';
                    if (imageUrl) {
                      const trimmed = imageUrl.trim();
                      newQrCodeUrl = trimmed === '' ? '' : trimmed;
                    }

                    setFormData((prev) => ({
                      ...prev,
                      qr_code_url: newQrCodeUrl,
                    }));

                    console.log('🖼️ Payment method QR code updated in formData:', {
                      original: imageUrl,
                      saved: newQrCodeUrl,
                    });
                  }}
                  folder="menu-images"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-900 mb-1.5 sm:mb-2">Sort Order</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-gray-900 transition-colors text-gray-900"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Lower numbers appear first in the checkout
                </p>
              </div>

              <div className="flex items-center">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm font-medium text-gray-900">Active Payment Method</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
      <div className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 py-3 sm:py-0 sm:h-16">
            <div className="flex items-center space-x-2 sm:space-x-4 w-full sm:w-auto">
              <button
                onClick={onBack}
                className="flex items-center space-x-1 sm:space-x-2 text-gray-700 hover:text-amber-600 transition-colors duration-200"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-sm sm:text-base">Dashboard</span>
              </button>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">
                Payment Methods
              </h1>
            </div>
            <button
              onClick={handleAddMethod}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-gray-900 hover:bg-gray-800 text-white px-3 sm:px-4 py-2 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl border border-gray-900/20 text-sm sm:text-base"
            >
              <Plus className="h-4 w-4" />
              <span>Add Payment Method</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Shop-wide COD switch sits above the online methods: both answer
            "how can customers pay?", so they belong on one screen. */}
        <CodToggle />

        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
              Payment Methods
            </h2>

            {paymentMethods.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm sm:text-base text-gray-500 mb-4">No payment methods found</p>
                <button
                  onClick={handleAddMethod}
                  className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl border border-gray-900/20 text-sm sm:text-base"
                >
                  Add First Payment Method
                </button>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 p-3 sm:p-4 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200"
                  >
                    <div className="flex items-center space-x-3 sm:space-x-4 w-full sm:w-auto">
                      <div className="flex-shrink-0">
                        <img
                          src={method.qr_code_url}
                          alt={`${method.name} QR Code`}
                          className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg border-2 border-gray-200 object-cover"
                          onError={(e) => {
                            e.currentTarget.src = 'https://images.pexels.com/photos/8867482/pexels-photo-8867482.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop';
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm sm:text-base text-gray-900 mb-1">{method.name}</h3>
                        <p className="text-xs sm:text-sm text-gray-600 truncate">{method.account_number}</p>
                        <p className="text-xs sm:text-sm text-gray-500 truncate">Account: {method.account_name}</p>
                        <p className="text-xs text-gray-400 mt-1">ID: {method.id} • Order: #{method.sort_order}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto justify-end sm:justify-start">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${method.active
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : 'bg-gray-100 text-gray-600 border border-gray-300'
                        }`}>
                        {method.active ? 'Active' : 'Inactive'}
                      </span>

                      <button
                        onClick={() => handleEditMethod(method)}
                        className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors duration-200 border border-blue-200"
                        aria-label="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteMethod(method.id)}
                        className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200 border border-red-300/30"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodManager;