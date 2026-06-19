import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Package, TrendingUp, AlertTriangle, Search, Edit, Trash2, Plus, Download, RefreshCw, Layers } from 'lucide-react';
import type { Product } from '../types';
import { useMenu } from '../hooks/useMenu';
import { useCategories } from '../hooks/useCategories';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { supabase } from '../lib/supabase';

interface PeptideInventoryManagerProps {
  onBack: () => void;
}

const PeptideInventoryManager: React.FC<PeptideInventoryManagerProps> = ({ onBack }) => {
  const { signOut } = useAdminAuth();
  const { products, loading, refreshProducts, deleteProduct, deleteVariation } = useMenu();
  const { categories } = useCategories();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);

  // Load confirmed orders for sales calculation
  useEffect(() => {
    loadOrders();

    // Listen for order confirmation events to refresh sales data
    const handleOrderConfirmed = () => {
      loadOrders();
    };

    window.addEventListener('orderConfirmed', handleOrderConfirmed);

    return () => {
      window.removeEventListener('orderConfirmed', handleOrderConfirmed);
    };
  }, []);

  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('total_price, shipping_fee, order_items, order_status')
        .in('order_status', ['confirmed', 'processing', 'shipped', 'delivered'])
        .eq('payment_status', 'paid');

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders for sales:', error);
      setOrders([]);
    }
  };

  // Calculate stats
  const stats = useMemo(() => {
    // Calculate total sales from confirmed/paid orders
    const totalSales = orders.reduce((sum, order) => {
      const orderTotal = Number(order.total_price) + (Number(order.shipping_fee) || 0);
      return sum + orderTotal;
    }, 0);

    // Calculate total vials sold from confirmed orders
    const totalVialsSold = orders.reduce((sum, order) => {
      if (order.order_items && Array.isArray(order.order_items)) {
        const vialsInOrder = order.order_items.reduce((itemSum: number, item: any) => {
          return itemSum + (item.quantity || 0);
        }, 0);
        return sum + vialsInOrder;
      }
      return sum;
    }, 0);

    const totalInventoryValue = products.reduce((sum, product) => {
      const price = product.discount_active && product.discount_price
        ? product.discount_price
        : product.base_price;

      // For products with variations, sum up variation stock values
      if (product.variations && product.variations.length > 0) {
        const variationValue = product.variations.reduce((vSum, variation) => {
          return vSum + (variation.stock_quantity * variation.price);
        }, 0);
        return sum + variationValue;
      }

      return sum + (product.stock_quantity * price);
    }, 0);

    const totalItems = products.length;

    const lowStockItems = products.filter(product => {
      if (product.variations && product.variations.length > 0) {
        // Check if any variation is low stock (less than 5)
        return product.variations.some(v => v.stock_quantity > 0 && v.stock_quantity < 5);
      }
      return product.stock_quantity > 0 && product.stock_quantity < 5;
    }).length;

    return {
      totalSales,
      totalVialsSold,
      totalInventoryValue,
      totalItems,
      lowStockItems
    };
  }, [products, orders]);

  // Filter products
  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
      );
    }

    // Filter by stock status
    if (selectedFilter === 'low-stock') {
      filtered = filtered.filter(product => {
        if (product.variations && product.variations.length > 0) {
          return product.variations.some(v => v.stock_quantity > 0 && v.stock_quantity < 5);
        }
        return product.stock_quantity > 0 && product.stock_quantity < 5;
      });
    } else if (selectedFilter === 'out-of-stock') {
      filtered = filtered.filter(product => {
        if (product.variations && product.variations.length > 0) {
          return product.variations.every(v => v.stock_quantity === 0);
        }
        return product.stock_quantity === 0;
      });
    } else if (selectedFilter === 'in-stock') {
      filtered = filtered.filter(product => {
        if (product.variations && product.variations.length > 0) {
          return product.variations.some(v => v.stock_quantity > 0);
        }
        return product.stock_quantity > 0;
      });
    }

    return filtered;
  }, [products, selectedCategory, searchQuery, selectedFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshProducts();
    await loadOrders();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleUpdateStock = async (productId: string, variationId: string | null, newStock: number) => {
    try {
      if (variationId) {
        // Update variation stock
        const { error } = await supabase
          .from('product_variations')
          .update({ stock_quantity: newStock })
          .eq('id', variationId);

        if (error) throw error;
      } else {
        // Update product stock
        const { error } = await supabase
          .from('products')
          .update({ stock_quantity: newStock })
          .eq('id', productId);

        if (error) throw error;
      }

      await refreshProducts();
      alert('Stock updated successfully!');
    } catch (error) {
      console.error('Error updating stock:', error);
      alert('Failed to update stock. Please try again.');
    }
  };

  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (confirm(`Are you sure you want to delete "${productName}"? This action cannot be undone.`)) {
      try {
        const result = await deleteProduct(productId);
        if (result.success) {
          alert('Product deleted successfully!');
          await refreshProducts();
        } else {
          alert(result.error || 'Failed to delete product');
        }
      } catch (error) {
        console.error('Error deleting product:', error);
        alert('Failed to delete product. Please try again.');
      }
    }
  };

  const handleDeleteVariation = async (variationId: string, variationName: string) => {
    if (confirm(`Are you sure you want to delete "${variationName}"? This action cannot be undone.`)) {
      try {
        const result = await deleteVariation(variationId);
        if (result.success) {
          alert('Variation deleted successfully!');
          await refreshProducts();
        } else {
          alert(result.error || 'Failed to delete variation');
        }
      } catch (error) {
        console.error('Error deleting variation:', error);
        alert('Failed to delete variation. Please try again.');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-gold-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading inventory... ✨</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
      {/* Header */}
      <div className="bg-white shadow-md border-b-4 border-navy-900">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between h-12 md:h-14">
            <div className="flex items-center space-x-2">
              <button
                onClick={onBack}
                className="text-gray-700 hover:text-gold-600 transition-colors flex items-center gap-1 group"
              >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs md:text-sm">Dashboard</span>
              </button>
              <h1 className="text-sm md:text-base font-bold text-navy-900">
                Peptide Inventory
              </h1>
            </div>
            <button
              onClick={() => { void signOut(); }}
              className="bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 text-white px-2 md:px-3 py-1 rounded-md font-medium text-xs shadow-sm hover:shadow transition-all"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 md:py-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
          {/* Total Sales Income */}
          <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-4 md:p-5 border border-navy-700/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs md:text-sm font-medium text-gray-600">Total Sales Income</h3>
              <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-gold-600" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">₱{stats.totalSales.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-gray-500 mt-1">Vials Sold: {stats.totalVialsSold}</p>
          </div>

          {/* Inventory Value */}
          <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-4 md:p-5 border border-navy-700/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs md:text-sm font-medium text-gray-600">Inventory Value</h3>
              <Package className="w-4 h-4 md:w-5 md:h-5 text-gold-600" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">₱{stats.totalInventoryValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-gray-500 mt-1">Total Items: {stats.totalItems}</p>
          </div>

          {/* Low Stock */}
          <div className="bg-gradient-to-br from-gold-500 to-gold-600 rounded-lg md:rounded-xl shadow-lg p-4 md:p-5 text-black border border-gold-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs md:text-sm font-medium">Low Stock</h3>
              <AlertTriangle className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-bold">{stats.lowStockItems}</p>
            <p className="text-xs mt-1 opacity-80">Needs attention</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-3 md:p-4 mb-4 md:mb-6 border border-navy-700/30">
          <div className="flex flex-col md:flex-row gap-2 md:gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 md:py-2 text-sm border border-gray-300 rounded-md focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-gold-500 transition-colors text-gray-900"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 md:py-2 text-sm border border-gray-300 rounded-md focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-gold-500 bg-white transition-colors text-gray-900"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="px-3 py-1.5 md:py-2 text-sm border border-gray-300 rounded-md focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-gold-500 bg-white transition-colors text-gray-900"
            >
              <option value="all">All Items</option>
              <option value="in-stock">In Stock</option>
              <option value="low-stock">Low Stock</option>
              <option value="out-of-stock">Out of Stock</option>
            </select>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-navy-900 hover:bg-navy-800 text-white px-3 py-1.5 md:py-2 rounded-md font-medium text-xs md:text-sm shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 border border-navy-900/20"
            >
              <RefreshCw className={`w-3 h-3 md:w-4 md:h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Inventory List */}
        <div className="space-y-4">
          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-8 md:p-12 text-center border border-navy-700/30">
              <Package className="w-12 h-12 md:w-16 md:h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium text-base md:text-lg">No products found</p>
              <p className="text-gray-500 text-xs md:text-sm mt-2">Try adjusting your search or filters</p>
            </div>
          ) : (
            filteredProducts.map((product) => (
              <InventoryItemCard
                key={product.id}
                product={product}
                categories={categories}
                onUpdateStock={handleUpdateStock}
                onDeleteProduct={handleDeleteProduct}
                onDeleteVariation={handleDeleteVariation}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Inventory Item Card Component
interface InventoryItemCardProps {
  product: Product;
  categories: Array<{ id: string; name: string }>;
  onUpdateStock: (productId: string, variationId: string | null, newStock: number) => void;
  onDeleteProduct: (productId: string, productName: string) => void;
  onDeleteVariation: (variationId: string, variationName: string) => void;
}

const InventoryItemCard: React.FC<InventoryItemCardProps> = ({ product, categories, onUpdateStock, onDeleteProduct, onDeleteVariation }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editStock, setEditStock] = useState<{ [key: string]: number }>({});

  // If product has variations, show each variation separately
  if (product.variations && product.variations.length > 0) {
    return (
      <>
        {product.variations.map((variation) => {
          const stockKey = `variation-${variation.id}`;
          const currentStock = editStock[stockKey] !== undefined
            ? editStock[stockKey]
            : variation.stock_quantity;

          return (
            <div
              key={variation.id}
              className="bg-white rounded-lg md:rounded-xl shadow-md p-3 md:p-4 border border-navy-700/30 hover:border-navy-900/50 transition-all"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="font-bold text-gray-900 text-sm md:text-base">
                      {product.name} {variation.name}
                    </h3>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-[10px] md:text-xs font-medium">
                      {categories.find(c => c.id === product.category)?.name || product.category}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] md:text-xs font-semibold ${variation.stock_quantity > 0
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                      }`}>
                      {variation.stock_quantity > 0 ? 'IN STOCK' : 'OUT OF STOCK'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 text-xs md:text-sm">
                    <div>
                      <span className="text-gray-500 text-[10px] md:text-xs">Price per Vial</span>
                      <p className="font-semibold text-gray-900">₱{variation.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-[10px] md:text-xs">Quantity</span>
                      <p className="font-semibold text-gray-900">{variation.stock_quantity} vials</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-[10px] md:text-xs">Total Value</span>
                      <p className="font-semibold text-gold-600">
                        ₱{(variation.stock_quantity * variation.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-[10px] md:text-xs">Expiration</span>
                      <p className="font-semibold text-gray-900">N/A</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {isEditing && editStock[stockKey] !== undefined ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={currentStock}
                        onChange={(e) => setEditStock({ ...editStock, [stockKey]: parseInt(e.target.value) || 0 })}
                        className="w-16 md:w-20 px-2 py-1 text-xs md:text-sm border border-gray-300 rounded text-center focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-gold-500 text-gray-900"
                        min="0"
                      />
                      <button
                        onClick={() => {
                          onUpdateStock(product.id, variation.id, currentStock);
                          setIsEditing(false);
                          setEditStock({});
                        }}
                        className="px-2 md:px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setEditStock({});
                        }}
                        className="px-2 md:px-3 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setIsEditing(true);
                          setEditStock({ [stockKey]: variation.stock_quantity });
                        }}
                        className="flex-1 px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-black rounded-md font-medium flex items-center justify-center gap-1.5 text-xs md:text-sm transition-colors"
                      >
                        <Edit className="w-3 h-3 md:w-4 md:h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => onDeleteVariation(variation.id, `${product.name} ${variation.name}`)}
                        className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-md font-medium flex items-center justify-center gap-1.5 text-xs md:text-sm transition-colors"
                      >
                        <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  // Product without variations
  const stockKey = `product-${product.id}`;
  const currentStock = editStock[stockKey] !== undefined
    ? editStock[stockKey]
    : product.stock_quantity;

  const price = product.discount_active && product.discount_price
    ? product.discount_price
    : product.base_price;

  return (
    <div className="bg-white rounded-lg md:rounded-xl shadow-md p-3 md:p-4 border border-navy-700/30 hover:border-navy-900/50 transition-all">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-bold text-gray-900 text-sm md:text-base">{product.name}</h3>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-[10px] md:text-xs font-medium">
              {categories.find(c => c.id === product.category)?.name || product.category}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] md:text-xs font-semibold ${product.stock_quantity > 0
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
              }`}>
              {product.stock_quantity > 0 ? 'IN STOCK' : 'OUT OF STOCK'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 text-xs md:text-sm">
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Price per Vial</span>
              <p className="font-semibold text-gray-900">₱{price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
            </div>
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Quantity</span>
              <p className="font-semibold text-gray-900">{product.stock_quantity} vials</p>
            </div>
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Total Value</span>
              <p className="font-semibold text-gold-600">
                ₱{(product.stock_quantity * price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Expiration</span>
              <p className="font-semibold text-gray-900">N/A</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {isEditing && editStock[stockKey] !== undefined ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={currentStock}
                onChange={(e) => setEditStock({ ...editStock, [stockKey]: parseInt(e.target.value) || 0 })}
                className="w-16 md:w-20 px-2 py-1 text-xs md:text-sm border border-gray-300 rounded text-center focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-gold-500 text-gray-900"
                min="0"
              />
              <button
                onClick={() => {
                  onUpdateStock(product.id, null, currentStock);
                  setIsEditing(false);
                  setEditStock({});
                }}
                className="px-2 md:px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditStock({});
                }}
                className="px-2 md:px-3 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsEditing(true);
                  setEditStock({ [stockKey]: product.stock_quantity });
                }}
                className="flex-1 px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-black rounded-md font-medium flex items-center justify-center gap-1.5 text-xs md:text-sm transition-colors"
              >
                <Edit className="w-3 h-3 md:w-4 md:h-4" />
                Edit
              </button>
              <button
                onClick={() => onDeleteProduct(product.id, product.name)}
                className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-md font-medium flex items-center justify-center gap-1.5 text-xs md:text-sm transition-colors"
              >
                <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PeptideInventoryManager;
