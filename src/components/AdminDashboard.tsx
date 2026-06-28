import React, { useState, useEffect } from 'react';
import AccessRequestsManager from './AccessRequestsManager';
import AdminLogin from './AdminLogin';
import BlossomLogo from './BlossomLogo';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { Plus, Edit, Trash2, Save, X, ArrowLeft, TrendingUp, Package, Users, FolderOpen, CreditCard, Sparkles, Layers, Shield, RefreshCw, Warehouse, ShoppingCart, HelpCircle, MapPin, Tag, Truck, Boxes, Sticker as StickerIcon } from 'lucide-react';
import type { Product } from '../types';
import { useMenu } from '../hooks/useMenu';
import { useCategories } from '../hooks/useCategories';
import { useProtocols } from '../hooks/useProtocols';
import { useAccessRequests } from '../hooks/useAccessRequests';
import { generateProtocolFromTemplate } from '../lib/protocolTemplates';
import ImageUpload from './ImageUpload';
import CategoryManager from './CategoryManager';
import TierManager from './TierManager';
import PaymentMethodManager from './PaymentMethodManager';
import VariationManager from './VariationManager';
import { MoneyInput } from './MoneyInput';
import COAManager from './COAManager';
import PeptideInventoryManager from './PeptideInventoryManager';
import OrdersManager from './OrdersManager';
import FAQManager from './FAQManager';
import ShippingManager from './ShippingManager';
import SiteSettingsManager from './SiteSettingsManager';
import PromoCodeManager from './PromoCodeManager';
import CourierManager from './CourierManager';
import StickerManager from './StickerManager';
import ProtocolManager from './ProtocolManager';
import GroupBuyManager from './GroupBuyManager';
// GuideManager removed (Peptalk functionality disabled)

const AdminDashboard: React.FC = () => {
  const { isAdmin, loading: authLoading, error: authError, signIn, signOut } = useAdminAuth();
  const { products, loading, addProduct, updateProduct, deleteProduct, refreshProducts } = useMenu();
  const { categories } = useCategories();
  const [currentView, setCurrentView] = useState<'dashboard' | 'products' | 'add' | 'edit' | 'categories' | 'payments' | 'inventory' | 'orders' | 'shipping' | 'coa' | 'faq' | 'settings' | 'promo-codes' | 'couriers' | 'stickers' | 'protocols' | 'access-requests' | 'group-buy' | 'tiers'>('dashboard');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [managingVariationsProductId, setManagingVariationsProductId] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { addProtocol, protocols } = useProtocols();
  const { requests: accessRequests, fetchAll: fetchAccessRequests } = useAccessRequests();
  const pendingAccessCount = accessRequests.filter((r) => r.status === 'pending').length;

  // Surface the pending access-request count on the dashboard card.
  useEffect(() => {
    if (isAdmin) fetchAccessRequests();
  }, [isAdmin, fetchAccessRequests]);

  const variationManagerProduct = managingVariationsProductId
    ? products.find((product) => product.id === managingVariationsProductId) || null
    : null;

  const variationManagerModal = variationManagerProduct ? (
    <VariationManager
      product={variationManagerProduct}
      onClose={() => setManagingVariationsProductId(null)}
      onUpdate={refreshProducts}
    />
  ) : null;

  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    description: '',
    base_price: 0,
    category: 'research',
    featured: false,
    available: true,
    purity_percentage: 99.0,
    molecular_weight: '',
    cas_number: '',
    sequence: '',
    storage_conditions: 'Store at -20°C',
    stock_quantity: 0,
    image_url: null,
    discount_active: false,
    inclusions: null
  });
  const [inclusionsText, setInclusionsText] = useState('');
  const [autoGenerateProtocol, setAutoGenerateProtocol] = useState(false);


  const handleAddProduct = () => {
    setCurrentView('add');
    setSelectedProducts(new Set());
    setManagingVariationsProductId(null);
    const defaultCategory = categories.length > 0 ? categories[0].id : 'research';
    setFormData({
      name: '',
      description: '',
      base_price: 0,
      category: defaultCategory,
      featured: false,
      available: true,
      purity_percentage: 99.0,
      molecular_weight: '',
      cas_number: '',
      sequence: '',
      storage_conditions: 'Store at -20°C',
      stock_quantity: 0,
      image_url: null,
      discount_active: false,
      inclusions: null
    });
    setInclusionsText('');
    setAutoGenerateProtocol(true); // Default to true for new products
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setFormData(product);
    setInclusionsText(product.inclusions ? product.inclusions.join('\n') : '');
    setCurrentView('edit');
    setSelectedProducts(new Set());
    setManagingVariationsProductId(null);
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      setManagingVariationsProductId(null);
      try {
        setIsProcessing(true);
        const result = await deleteProduct(id);
        if (!result.success) {
          alert(result.error || 'Failed to delete product');
        }
      } catch (error) {
        alert('Failed to delete product. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.size === 0) {
      alert('Please select products to delete');
      return;
    }

    if (confirm(`Are you sure you want to delete ${selectedProducts.size} product(s)? This action cannot be undone.`)) {
      try {
        setIsProcessing(true);
        let successCount = 0;
        let failedCount = 0;

        for (const productId of selectedProducts) {
          const result = await deleteProduct(productId);
          if (result.success) {
            successCount++;
          } else {
            failedCount++;
          }
        }

        if (failedCount > 0) {
          alert(`Deleted ${successCount} product(s). ${failedCount} failed.`);
        } else {
          alert(`Successfully deleted ${successCount} product(s)`);
        }

        setSelectedProducts(new Set());
        setManagingVariationsProductId(null);
      } catch (error) {
        alert('Failed to delete products. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    }
  };


  const toggleSelectProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
      setManagingVariationsProductId(null);
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
  };

  const handleSaveProduct = async () => {
    if (!formData.name || !formData.description || !formData.base_price) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setIsProcessing(true);

      // Prepare data for saving - convert undefined to null for nullable fields
      const prepareData = (data: Partial<Product>) => {
        const prepared = { ...data };
        // Convert undefined to null for nullable fields
        if (prepared.image_url === undefined) prepared.image_url = null;
        if (prepared.safety_sheet_url === undefined) prepared.safety_sheet_url = null;
        if (prepared.discount_price === undefined) prepared.discount_price = null;
        if (prepared.molecular_weight === undefined) prepared.molecular_weight = null;
        if (prepared.cas_number === undefined) prepared.cas_number = null;
        if (prepared.sequence === undefined) prepared.sequence = null;
        if (prepared.inclusions === undefined) prepared.inclusions = null;
        return prepared;
      };

      // Only send columns that actually exist in the `products` table
      const pickProductDbFields = (data: Partial<Product>) => {
        const allowedKeys: (keyof Product)[] = [
          'name',
          'description',
          'category',
          'base_price',
          'discount_price',
          'discount_active',
          'purity_percentage',
          'molecular_weight',
          'cas_number',
          'sequence',
          'storage_conditions',
          'stock_quantity',
          'available',
          'featured',
          'image_url',
          'safety_sheet_url',
          'inclusions',
        ];

        const dbPayload: Partial<Product> = {};
        for (const key of allowedKeys) {
          if (key in data) {
            // @ts-expect-error index by key
            dbPayload[key] = data[key];
          }
        }
        return dbPayload;
      };

      if (editingProduct) {
        // Remove read-only fields and relations before updating
        const { id, created_at, updated_at, variations, ...updateData } = formData as Product;

        // EXPLICITLY ensure image_url is included (even if it's null/undefined)
        // Get image_url directly from formData to ensure we have the latest value
        const imageUrlValue = formData.image_url !== undefined ? formData.image_url : null;

        // Create update payload - ensure image_url is always included
        const updatePayload: any = {
          ...updateData,
        };

        // ALWAYS explicitly set image_url, even if it's null
        updatePayload.image_url = imageUrlValue;

        const preparedData = prepareData(updatePayload);

        // Triple-check: Force image_url to be in the payload
        preparedData.image_url = imageUrlValue;

        // Strip out any fields that don't exist on the products table
        const dbPayload = pickProductDbFields(preparedData);

        // Log to verify it's included
        console.log('🔍 Final payload check:', {
          has_image_url: 'image_url' in dbPayload,
          image_url_value: dbPayload.image_url,
          image_url_type: typeof dbPayload.image_url,
          all_keys: Object.keys(dbPayload)
        });

        console.log('💾 Saving product update:', {
          id: editingProduct.id,
          image_url: dbPayload.image_url,
          image_url_type: typeof dbPayload.image_url,
          image_url_length: dbPayload.image_url?.length || 0,
          fullPayload: dbPayload
        });

        const result = await updateProduct(editingProduct.id, dbPayload);
        if (!result.success) {
          console.error('❌ Update failed:', result.error);
          throw new Error(result.error || 'Failed to update product');
        }

        // Verify the image was saved
        if (result.data && result.data.image_url !== preparedData.image_url) {
          console.warn('⚠️ Image URL mismatch after save:', {
            sent: preparedData.image_url,
            received: result.data.image_url
          });
        }

        console.log('✅ Product updated successfully', {
          saved_image_url: result.data?.image_url
        });

        // Generate protocol when editing if checkbox is checked
        if (autoGenerateProtocol && result.data) {
          try {
            console.log('📋 Generating protocol from template...');
            // Convert category ID to display name for template matching
            const categoryName = categories.find(cat => cat.id === result.data.category)?.name || result.data.category || 'default';
            console.log('📋 Category for template:', categoryName);

            const protocolData = generateProtocolFromTemplate(
              result.data.name,
              categoryName
            );
            if (!protocolData) {
              alert('Product updated. No matching protocol template for this category — skipped protocol creation.');
            } else {
              await addProtocol({
                ...protocolData,
                product_id: result.data.id
              });
              console.log('✅ Protocol generated for edited product');
              alert('Product updated AND Protocol generated successfully!');
            }
          } catch (protocolError) {
            console.error('❌ Protocol Generation Error:', protocolError);
            alert(`Product updated, but protocol generation failed.`);
          }
        } else {
          alert('Product updated successfully!');
        }
      } else {
        // Remove non-creatable fields for new products
        const { variations, ...createData } = formData as any;

        // EXPLICITLY ensure image_url is included
        const createPayload = {
          ...createData,
          image_url: formData.image_url !== undefined ? formData.image_url : null,
        };

        const preparedData = prepareData(createPayload);

        // Strip out any fields that don't exist on the products table for insert
        const dbPayload = pickProductDbFields(preparedData);
        console.log('💾 Creating new product:', {
          name: dbPayload.name,
          image_url: dbPayload.image_url,
          fullPayload: dbPayload
        });

        const result = await addProduct(dbPayload as Omit<Product, 'id' | 'created_at' | 'updated_at'>);
        if (!result.success) {
          throw new Error(result.error);
        }
        console.log('✅ Product created successfully');

        // Template-based Protocol Generation (FREE - No AI needed)
        if (autoGenerateProtocol) {
          try {
            console.log('📋 Generating protocol from template...');

            // Convert category ID to display name for template matching
            const categoryName = categories.find(cat => cat.id === dbPayload.category)?.name || dbPayload.category || 'default';
            console.log('📋 Category for template:', categoryName);

            const protocolData = generateProtocolFromTemplate(
              dbPayload.name!,
              categoryName
            );

            if (!protocolData) {
              alert('Product saved. No matching protocol template for this category — skipped protocol creation.');
            } else if (result.data) {
              console.log('✅ Protocol generated from template:', protocolData);
              await addProtocol({
                ...protocolData,
                product_id: result.data.id
              });
              alert('Product saved AND Protocol auto-generated successfully!');
            }
          } catch (protocolError) {
            console.error('❌ Protocol Generation Error:', protocolError);
            alert(`Product saved, but protocol generation failed: ${protocolError instanceof Error ? protocolError.message : 'Unknown error'}`);
          }
        } else {
          alert('Product saved successfully!');
        }
      }

      // Refresh products to ensure UI is updated
      console.log('🔄 Refreshing products after save...');
      await refreshProducts();
      console.log('✅ Products refreshed');

      // If we were editing, verify the image was saved
      if (editingProduct && formData.image_url) {
        console.log('🔍 Verifying saved image URL:', formData.image_url);
        // The refresh should have updated the products list with the new image
      }

      setCurrentView('products');
      setEditingProduct(null);
      setManagingVariationsProductId(null);
    } catch (error) {
      console.error('❌ Error saving product:', error);
      alert(`Failed to save product: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setCurrentView(currentView === 'add' || currentView === 'edit' ? 'products' : 'dashboard');
    setEditingProduct(null);
    setManagingVariationsProductId(null);
  };

  // Dashboard Stats
  const totalProducts = products.length;
  const featuredProducts = products.filter(p => p.featured).length;
  const availableProducts = products.filter(p => p.available).length;
  const categoryCounts = categories.map(cat => ({
    ...cat,
    count: products.filter(p => p.category === cat.id).length
  }));

  const handleLogout = async () => {
    await signOut();
    setCurrentView('dashboard');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshProducts();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Resolving the session / admin check on first paint.
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-400 font-medium">Checking access…</p>
        </div>
      </div>
    );
  }

  // Login Screen — real Supabase Auth, gated by admin membership (is_admin()).
  if (!isAdmin) {
    return <AdminLogin onSignIn={signIn} error={authError} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-400 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Form View (Add/Edit)
  if (currentView === 'add' || currentView === 'edit') {
    return (
      <>
        {variationManagerModal}
        <div className="min-h-screen bg-gray-50">
          <div className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-6xl mx-auto px-3 sm:px-4">
              <div className="flex items-center justify-between h-12 md:h-14 gap-2">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCancel}
                    className="text-gray-700 hover:text-brand-400 transition-colors flex items-center gap-1 group"
                  >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-xs md:text-sm">Back</span>
                  </button>
                  <h1 className="text-sm md:text-base font-bold text-navy-900">
                    {currentView === 'add' ? '✨ Add New' : '✏️ Edit Product'}
                  </h1>
                </div>
                <div className="flex space-x-1.5">
                  <button onClick={handleCancel} className="px-2 py-1 bg-gray-100 border border-gray-300 hover:border-gray-400 rounded-md hover:bg-gray-200 transition-all flex items-center gap-1 text-xs text-gray-700">
                    <X className="h-3 w-3" />
                    <span className="hidden sm:inline">Cancel</span>
                  </button>
                  <button
                    onClick={handleSaveProduct}
                    disabled={isProcessing}
                    className="bg-gray-900 hover:bg-gray-800 text-white px-2 md:px-3 py-1 rounded-md transition-all flex items-center gap-1 shadow-sm hover:shadow disabled:opacity-50 text-xs"
                  >
                    <Save className="h-3 w-3" />
                    {isProcessing ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 md:py-4">
            <div className="bg-white rounded-lg md:rounded-xl shadow-sm p-3 md:p-4 lg:p-5 space-y-3 md:space-y-4 border border-gray-200">
              {/* Basic Information */}
              <div>
                <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                  <span className="text-base md:text-lg">📝</span>
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Product Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                      placeholder="e.g., BPC-157 5mg"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Description *</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                      placeholder="Detailed product description..."
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Category *</label>
                    <select
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Base Price (₱) *</label>
                    <MoneyInput
                      value={formData.base_price || null}
                      allowEmpty
                      onChange={(base_price) => setFormData({ ...formData, base_price: base_price ?? 0 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                      placeholder="0"
                    />
                    {editingProduct && editingProduct.variations && editingProduct.variations.length > 0 && (
                      <p className="text-xs text-orange-600 mt-2 flex items-start gap-1.5 bg-orange-50 p-2 rounded border border-orange-200">
                        <span className="text-base">⚠️</span>
                        <span>This product has <strong>{editingProduct.variations.length} size variation(s)</strong>. Customers will see those prices instead of this base price. Use the <strong>"Manage Sizes"</strong> button to update the prices shown on the website.</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Scientific Details */}
              <div>
                <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                  <span className="text-base md:text-lg">🧪</span>
                  Scientific Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Purity (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.purity_percentage || ''}
                      onChange={(e) => setFormData({ ...formData, purity_percentage: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                      placeholder="99.0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Molecular Weight</label>
                    <input
                      type="text"
                      value={formData.molecular_weight || ''}
                      onChange={(e) => setFormData({ ...formData, molecular_weight: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                      placeholder="e.g., 1419.55 g/mol"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">CAS Number</label>
                    <input
                      type="text"
                      value={formData.cas_number || ''}
                      onChange={(e) => setFormData({ ...formData, cas_number: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                      placeholder="e.g., 137525-51-0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Storage Conditions</label>
                    <input
                      type="text"
                      value={formData.storage_conditions || ''}
                      onChange={(e) => setFormData({ ...formData, storage_conditions: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                      placeholder="Store at -20°C"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Sequence</label>
                    <input
                      type="text"
                      value={formData.sequence || ''}
                      onChange={(e) => setFormData({ ...formData, sequence: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                      placeholder="e.g., GEPPPGKPADDAGLV"
                    />
                  </div>

                  {/* Auto-Generate Protocol Checkbox */}
                  <div className="md:col-span-2 mt-2 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoGenerateProtocol}
                        onChange={(e) => setAutoGenerateProtocol(e.target.checked)}
                        className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                      />
                      <div>
                        <span className="font-bold text-gray-800 flex items-center gap-2">
                          📋 {editingProduct ? 'Generate/Update Protocol' : 'Auto-Generate Protocol'}
                        </span>
                        <p className="text-xs text-gray-600">
                          {editingProduct
                            ? 'Create or update the dosage protocol for this product.'
                            : 'Automatically create a dosage protocol based on the product category.'}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Complete Set Inclusions */}
              <div className="bg-gradient-to-r from-gold-50 to-gray-50 border border-gray-200 rounded-lg p-3 md:p-4">
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <h3 className="text-sm md:text-base font-bold text-gray-900 flex items-center gap-1.5">
                    <span className="text-base md:text-lg">📦</span>
                    Complete Set Inclusions
                  </h3>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.inclusions !== null && formData.inclusions !== undefined}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setFormData({ ...formData, inclusions: null });
                          setInclusionsText('');
                        } else {
                          setFormData({ ...formData, inclusions: formData.inclusions || [] });
                          setInclusionsText(formData.inclusions ? formData.inclusions.join('\n') : '');
                        }
                      }}
                      className="w-4 h-4 text-brand-400 rounded focus:ring-brand-400"
                    />
                    <span className="text-xs font-semibold text-gray-700">This is a SET product</span>
                  </label>
                </div>
                {formData.inclusions !== null && formData.inclusions !== undefined ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      What's included in this set? (One item per line)
                    </label>
                    <textarea
                      value={inclusionsText}
                      onChange={(e) => {
                        setInclusionsText(e.target.value);
                        const items = e.target.value.split('\n').filter(item => item.trim() !== '');
                        setFormData({ ...formData, inclusions: items.length > 0 ? items : null });
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400 min-h-[80px]"
                      placeholder="Xpeptide Kit Inclusion:&#10;1 Peptide Vial&#10;1 Bacteriostatic Water&#10;6 Insulin Syringes&#10;1 3ml Syringe&#10;Alcohol Pads&#10;Xpeptide Manual Guide"
                      rows={6}
                    />
                    <p className="text-xs text-gray-500 mt-2 flex items-start gap-1.5">
                      <span className="text-brand-400 font-bold">💡</span>
                      <span>Enter each item on a new line. These will be displayed as a checklist on the product detail page. Check "This is a SET product" above to enable this feature.</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        let formatted = inclusionsText;

                        // 1. Split common linear separators
                        formatted = formatted
                          .replace(/•/g, '\n')       // Bullets
                          .replace(/\|\s*/g, '\n')   // Pipes
                          .replace(/\t/g, '\n')      // Tabs
                          .replace(/;\s*/g, '\n');   // Semicolons

                        // 2. Intelligence: Add newlines before "Nx " patterns (e.g., 1x, 10x)
                        // Look for a number followed by 'x' and a space, but ONLY if not at start of line
                        formatted = formatted.replace(/([^\n])\s+(\d+x\s)/gi, '$1\n$2');

                        // 3. Clean up double newlines
                        formatted = formatted.replace(/\n\s*\n/g, '\n');

                        setInclusionsText(formatted);

                        // Update form data immediately
                        const items = formatted.split('\n').filter(item => item.trim() !== '');
                        setFormData({ ...formData, inclusions: items.length > 0 ? items : null });
                      }}
                      className="mt-2 text-xs font-semibold text-charcoal-600 hover:text-charcoal-800 flex items-center gap-1 bg-charcoal-50 px-2 py-1 rounded border border-charcoal-100 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      Auto-Format List
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-xs text-gray-500 mb-2">Enable "This is a SET product" to add inclusions</p>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, inclusions: [] });
                        setInclusionsText('');
                      }}
                      className="text-xs text-brand-400 hover:text-gold-700 font-medium"
                    >
                      Enable SET feature
                    </button>
                  </div>
                )}
              </div>

              {/* Inventory */}
              <div>
                <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                  <span className="text-base md:text-lg">📦</span>
                  Inventory & Availability
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Stock Quantity</label>
                    <input
                      type="number"
                      value={formData.stock_quantity || ''}
                      onChange={(e) => setFormData({ ...formData, stock_quantity: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 pt-0 sm:pt-6">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.featured || false}
                        onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                        className="w-4 h-4 text-brand-400 rounded focus:ring-brand-400"
                      />
                      <span className="text-xs font-semibold text-gray-700">⭐ Featured</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.available ?? true}
                        onChange={(e) => setFormData({ ...formData, available: e.target.checked })}
                        className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                      />
                      <span className="text-xs font-semibold text-gray-700">✅ Available</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Discount */}
              <div>
                <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                  <span className="text-base md:text-lg">💰</span>
                  Discount Pricing
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Discount Price (₱)</label>
                    <MoneyInput
                      value={formData.discount_price ?? null}
                      allowEmpty
                      onChange={(discount_price) => setFormData({ ...formData, discount_price })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all bg-white text-black placeholder-gray-400"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex items-center pt-0 md:pt-6">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.discount_active || false}
                        onChange={(e) => setFormData({ ...formData, discount_active: e.target.checked })}
                        className="w-4 h-4 text-red-600 rounded focus:ring-brand-400"
                      />
                      <span className="text-xs font-semibold text-gray-700">🏷️ Enable Discount</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Product Image */}
              <div>
                <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                  <span className="text-base md:text-lg">🖼️</span>
                  Product Image
                </h3>
                <p className="text-xs text-gray-500 mb-2">
                  Upload a product image (optional). This will appear on the customer-facing site.
                </p>
                <ImageUpload
                  currentImage={formData.image_url || undefined}
                  onImageChange={(imageUrl) => {
                    // Normalize value: undefined/null → null, non-empty string → trimmed URL
                    let newImageUrl: string | null = null;
                    if (imageUrl) {
                      const trimmed = imageUrl.trim();
                      newImageUrl = trimmed === '' ? null : trimmed;
                    }

                    setFormData((prev) => ({
                      ...prev,
                      image_url: newImageUrl,
                    }));

                    console.log('🖼️ Product image updated in formData:', {
                      original: imageUrl,
                      saved: newImageUrl,
                    });
                  }}
                />
              </div>

            </div>
          </div>
        </div >
      </>
    );
  }

  // Products List View
  if (currentView === 'products') {
    return (
      <>
        {variationManagerModal}
        <div className="min-h-screen bg-gray-50">
          <div className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-6xl mx-auto px-3 sm:px-4">
              <div className="flex items-center justify-between h-12 md:h-14">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentView('dashboard')}
                    className="text-gray-700 hover:text-brand-400 transition-colors flex items-center gap-1 group"
                  >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-xs md:text-sm">Dashboard</span>
                  </button>
                  <h1 className="text-sm md:text-base font-bold text-navy-900">Products</h1>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="bg-gray-900 hover:bg-gray-800 text-white px-2 py-1 rounded-md font-medium text-xs shadow-sm hover:shadow transition-all flex items-center gap-1 disabled:opacity-50 border border-gray-900/20"
                    title="Refresh data"
                  >
                    <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                  {selectedProducts.size > 0 && (
                    <button
                      onClick={handleBulkDelete}
                      disabled={isProcessing}
                      className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-2 md:px-3 py-1 rounded-md font-medium text-xs shadow-sm hover:shadow transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span className="hidden sm:inline">Delete ({selectedProducts.size})</span>
                      <span className="sm:hidden">Delete</span>
                    </button>
                  )}
                  <button
                    onClick={handleAddProduct}
                    className="bg-gray-900 hover:bg-gray-800 text-white px-2 md:px-3 py-1 rounded-md font-medium text-xs shadow-sm hover:shadow transition-all flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span className="hidden sm:inline">Add New</span>
                    <span className="sm:hidden">Add</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 md:py-4">
            {/* Selection Info Banner */}
            {selectedProducts.size > 0 && (
              <div className="mb-3 bg-gray-50 border border-gray-200 rounded-lg p-2 md:p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs md:text-sm font-semibold text-gray-900">
                    {selectedProducts.size} product{selectedProducts.size !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <button
                  onClick={() => setSelectedProducts(new Set())}
                  className="text-xs text-brand-400 hover:text-gold-700 font-medium underline"
                >
                  Clear Selection
                </button>
              </div>
            )}

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {products.map((product) => (
                <div key={product.id} className="bg-white rounded-xl shadow-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => toggleSelectProduct(product.id)}
                        className="mt-0.5 w-4 h-4 text-brand-400 rounded focus:ring-brand-400 cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{product.name}</h3>
                        <p className="text-xs text-gray-500 line-clamp-2">{product.description}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('🟣 Layers button clicked (mobile) for:', product.name);
                          setManagingVariationsProductId(product.id);
                        }}
                        disabled={isProcessing}
                        className={`p - 1.5 rounded - lg transition - all disabled: opacity - 50 disabled: cursor - not - allowed ${product.variations && product.variations.length > 0
                          ? 'bg-gold-500 text-black hover:bg-gold-600 shadow-md cursor-pointer'
                          : 'text-brand-400 hover:bg-gray-100 cursor-pointer'
                          } `}
                        title="Manage Sizes - Click to edit prices!"
                      >
                        <Layers className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEditProduct(product)}
                        disabled={isProcessing}
                        className="p-1.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        disabled={isProcessing}
                        className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="text-[10px] text-gray-500">Price</div>
                        <div className="text-sm font-bold text-gray-900">
                          ₱{product.base_price.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500">Stock</div>
                        <div className="text-sm font-semibold text-gray-900">{product.stock_quantity}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500">Sizes</div>
                        <div className="text-sm font-semibold text-brand-400">{product.variations?.length || 0}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {product.featured && (
                        <span className="text-xs">⭐</span>
                      )}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${product.available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                        {product.available ? '✅' : '❌'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-lg md:rounded-xl shadow-lg overflow-hidden border border-gray-200">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">
                        <input
                          type="checkbox"
                          checked={selectedProducts.size === products.length && products.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-brand-400 rounded focus:ring-brand-400 cursor-pointer"
                          title="Select All"
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Product</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800 hidden lg:table-cell">Category</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Price</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Sizes</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Purity</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Stock</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800 hidden xl:table-cell">Status</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleSelectProduct(product.id)}
                            className="w-4 h-4 text-brand-400 rounded focus:ring-brand-400 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-xs font-semibold text-gray-900">{product.name}</div>
                          <div className="text-[10px] text-gray-500 truncate max-w-xs">{product.description}</div>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600 hidden lg:table-cell">
                          {categories.find(cat => cat.id === product.category)?.name}
                        </td>
                        <td className="px-4 py-2 text-xs font-bold text-gray-900">
                          ₱{product.base_price.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          {product.variations && product.variations.length > 0 && (
                            <div className="text-[9px] text-brand-400 font-medium mt-0.5">
                              Not used (has sizes)
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {product.variations && product.variations.length > 0 ? (
                            <div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-600 text-white">
                                {product.variations.length} {product.variations.length === 1 ? 'size' : 'sizes'}
                              </span>
                              <div className="text-[9px] text-gray-500 mt-0.5">
                                Click <Layers className="w-2.5 h-2.5 inline text-brand-400" /> to edit
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400">No sizes</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-600 text-white">
                            {product.purity_percentage}%
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs font-medium text-gray-900">
                          {product.stock_quantity}
                        </td>
                        <td className="px-4 py-2 hidden xl:table-cell">
                          <div className="flex flex-col gap-0.5">
                            {product.featured && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-600 text-white">
                                ⭐ Featured
                              </span>
                            )}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${product.available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                              {product.available ? '✅' : '❌'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('🟣 Layers button clicked for:', product.name);
                                setManagingVariationsProductId(product.id);
                              }}
                              disabled={isProcessing}
                              className={`p-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${product.variations && product.variations.length > 0
                                ? 'bg-amber-500 text-black hover:bg-amber-600 shadow-md hover:shadow-lg cursor-pointer'
                                : 'text-gray-400 hover:bg-gray-100 cursor-pointer'
                                } `}
                              title="Manage Sizes - Click here to edit prices!"
                            >
                              <Layers className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleEditProduct(product)}
                              disabled={isProcessing}
                              className="p-1.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              disabled={isProcessing}
                              className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Categories View
  if (currentView === 'categories') {
    return (
      <div className="min-h-screen bg-gray-50">
        <CategoryManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  if (currentView === 'tiers') {
    return (
      <div className="min-h-screen bg-gray-50">
        <TierManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // Payment Methods View
  if (currentView === 'payments') {
    return (
      <div className="min-h-screen bg-gray-50">
        <PaymentMethodManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }


  // Inventory View
  if (currentView === 'inventory') {
    return (
      <div className="min-h-screen bg-gray-50">
        <PeptideInventoryManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // Orders View
  if (currentView === 'orders') {
    return (
      <div className="min-h-screen bg-gray-50">
        <OrdersManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // Group Buy View
  if (currentView === 'group-buy') {
    return (
      <div className="min-h-screen bg-gray-50">
        <GroupBuyManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // Access Requests View
  if (currentView === 'access-requests') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="mb-6 text-sm font-medium text-charcoal-600 hover:text-sakura-primary"
          >
            ‹ Back to dashboard
          </button>
          <AccessRequestsManager onChange={fetchAccessRequests} />
        </div>
      </div>
    );
  }

  // Shipping View
  if (currentView === 'shipping') {
    return (
      <div className="min-h-screen bg-gray-50">
        <ShippingManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // Couriers View
  if (currentView === 'couriers') {
    return (
      <div className="min-h-screen bg-gray-50">
        <CourierManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // Stickers View
  if (currentView === 'stickers') {
    return (
      <div className="min-h-screen bg-gray-50">
        <StickerManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // Protocols View
  if (currentView === 'protocols') {
    return (
      <div className="min-h-screen bg-gray-50">
        <ProtocolManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // COA View
  if (currentView === 'coa') {
    return (
      <div className="min-h-screen bg-gray-50">
        <COAManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // FAQ View
  if (currentView === 'faq') {
    return (
      <div className="min-h-screen bg-gray-50">
        <FAQManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // Promo Codes View
  if (currentView === 'promo-codes') {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="mb-4 text-gray-500 hover:text-gray-900 flex items-center gap-2 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <PromoCodeManager />
        </div>
      </div>
    );
  }

  // Guides view removed (Peptalk disabled)


  // Settings View
  if (currentView === 'settings') {
    // SiteSettingsManager doesn't seem to have onBack prop based on earlier view_file, 
    // checking its content... it has handleCancel but assumes rendered in place or manages its own state.
    // Looking at SiteSettingsManager.tsx line 251, it doesn't take props?
    // Wait, SiteSettingsManager.tsx as viewed in step 181 has no props defined in React.FC.
    // However, it has a back button logic internally? No, it has "Site Settings" header and Edit/Cancel buttons.
    // I should probably wrap it or modify it to support onBack if I want consistent UI.
    // For now I will wrap it in the standard layout style if needed, or just render it.
    // Given the dashboard structure, other managers take onBack. 
    // Let's assume for now I just render it, but I might need to make it comply with the layout.
    // Actually, looking at other managers they render full screen or modify view.
    // I'll render it and if it lacks a back button to dashboard, the user is stuck.
    // SiteSettingsManager from step 181 DOES NOT have a back button to main dashboard.
    // It has a "Cancel" button that exits edit mode.
    // I should wrap it or modify it. 
    // To match the requested speed, I'll modify AdminDashboard to render it with a manual Back button if needed, 
    // OR simply assume I'll fix SiteSettingsManager later.
    // BETTER: Render it inside the dashboard layout or add a wrapper here.
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="mb-4 text-gray-500 hover:text-gray-900 flex items-center gap-2 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <SiteSettingsManager />
        </div>
      </div>
    );
  }

  // Dashboard View
  return (
    <>
      {variationManagerModal}
      <div className="min-h-screen bg-gray-50 font-outfit">
        <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <div className="h-10 flex items-center">
                  <img
                    src="/logo.png"
                    alt="Pure Peps"
                    className="h-10 w-auto object-contain"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    <p className="text-xs text-gray-500 font-medium tracking-wide border px-1.5 py-0.5 rounded-full border-gray-200 bg-gray-50">
                      ADMIN DASHBOARD
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-gray-900 transition-colors font-medium text-sm hidden sm:block"
                >
                  View Website
                </a>
                <button
                  onClick={handleLogout}
                  className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm shadow-sm"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <button
              onClick={() => setCurrentView('products')}
              className="group relative overflow-hidden bg-white rounded-2xl p-5 border border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all duration-300 text-left"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Package className="w-24 h-24 text-blue-600" />
              </div>
              <div className="relative z-10">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <p className="text-sm font-medium text-gray-500 mb-1">Total Products</p>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">{totalProducts}</p>
              </div>
            </button>

            <button
              onClick={() => setCurrentView('products')}
              className="group relative overflow-hidden bg-white rounded-2xl p-5 border border-gray-200 hover:border-green-500 hover:shadow-lg transition-all duration-300 text-left"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingUp className="w-24 h-24 text-green-600" />
              </div>
              <div className="relative z-10">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <p className="text-sm font-medium text-gray-500 mb-1">Available Stock</p>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">{availableProducts}</p>
              </div>
            </button>

            <button
              onClick={() => setCurrentView('products')}
              className="group relative overflow-hidden bg-white rounded-2xl p-5 border border-gray-200 hover:border-amber-500 hover:shadow-lg transition-all duration-300 text-left"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Sparkles className="w-24 h-24 text-amber-600" />
              </div>
              <div className="relative z-10">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                  <Sparkles className="h-5 w-5 text-amber-600" />
                </div>
                <p className="text-sm font-medium text-gray-500 mb-1">Featured Items</p>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">{featuredProducts}</p>
              </div>
            </button>

            <button
              onClick={() => setCurrentView('categories')}
              className="group relative overflow-hidden bg-white rounded-2xl p-5 border border-gray-200 hover:border-purple-500 hover:shadow-lg transition-all duration-300 text-left"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Users className="w-24 h-24 text-purple-600" />
              </div>
              <div className="relative z-10">
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <p className="text-sm font-medium text-gray-500 mb-1">Categories</p>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">{categories.length}</p>
              </div>
            </button>
          </div>

          {/* Quick Actions & Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
                <div className="w-1 h-6 bg-blue-600 rounded-full"></div>
                Quick Actions
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleAddProduct}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Plus className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Add Product</span>
                    <span className="text-xs text-gray-500">Create new item</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('products')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Package className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-emerald-600 transition-colors">Manage Products</span>
                    <span className="text-xs text-gray-500">Edit existing items</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('categories')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <FolderOpen className="h-5 w-5 text-pink-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-pink-600 transition-colors">Categories</span>
                    <span className="text-xs text-gray-500">Organize items</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('orders')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <ShoppingCart className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-amber-600 transition-colors">Orders</span>
                    <span className="text-xs text-gray-500">View transactions</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('group-buy')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Boxes className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">Group Buy</span>
                    <span className="text-xs text-gray-500">Batches & caps</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('access-requests')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-sakura-blush flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <BlossomLogo size={20} />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-sakura-primary transition-colors">Access Requests</span>
                    <span className="text-xs text-gray-500">Approve members</span>
                  </div>
                  {pendingAccessCount > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-sakura-primary text-white text-[11px] font-bold">
                      {pendingAccessCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setCurrentView('tiers')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-sakura-blush flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Layers size={20} className="text-sakura-primary" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-sakura-primary transition-colors">Access Tiers</span>
                    <span className="text-xs text-gray-500">Category pricing</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('inventory')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Warehouse className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">Inventory</span>
                    <span className="text-xs text-gray-500">Track stock</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('shipping')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <MapPin className="h-5 w-5 text-cyan-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-cyan-600 transition-colors">Shipping</span>
                    <span className="text-xs text-gray-500">Manage rates</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('couriers')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Truck className="h-5 w-5 text-teal-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-teal-600 transition-colors">Couriers</span>
                    <span className="text-xs text-gray-500">Manage couriers</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('stickers')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <StickerIcon className="h-5 w-5 text-pink-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-pink-600 transition-colors">Stickers</span>
                    <span className="text-xs text-gray-500">Manage checkout stickers</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('coa')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Shield className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">Lab Results</span>
                    <span className="text-xs text-gray-500">Manage COAs</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('promo-codes')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Tag className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-rose-600 transition-colors">Promo Codes</span>
                    <span className="text-xs text-gray-500">Manage discounts</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('payments')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <CreditCard className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-violet-600 transition-colors">Payments</span>
                    <span className="text-xs text-gray-500">Manage methods</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('faq')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <HelpCircle className="h-5 w-5 text-teal-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-teal-600 transition-colors">FAQ</span>
                    <span className="text-xs text-gray-500">Manage content</span>
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('protocols')}
                  className="group flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Shield className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-rose-600 transition-colors">Protocols</span>
                    <span className="text-xs text-gray-500">Peptide guides</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
                <div className="w-1 h-6 bg-purple-600 rounded-full"></div>
                Categories
              </h3>
              <div className="space-y-1">
                {categoryCounts.map((category, index) => {
                  const bgColors = [
                    'bg-blue-100 text-blue-700',
                    'bg-purple-100 text-purple-700',
                    'bg-emerald-100 text-emerald-700',
                    'bg-amber-100 text-amber-700',
                    'bg-rose-100 text-rose-700',
                    'bg-cyan-100 text-cyan-700'
                  ];
                  return (
                    <div key={category.id} className="group flex items-center justify-between py-2.5 px-3 hover:bg-gray-50 rounded-lg transition-all cursor-default">
                      <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">{category.name}</span>
                      <span className={`text-[10px] font-bold ${bgColors[index % bgColors.length]} px-2.5 py-1 rounded-full`}>
                        {category.count}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-700 text-center leading-relaxed font-medium">
                  Tip: Manage your categories inventory and product distribution from the "Categories" tab.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </>
  );
};

export default AdminDashboard;
