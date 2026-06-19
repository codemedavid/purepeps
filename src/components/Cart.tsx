import React from 'react';
import { Trash2, ShoppingBag, ArrowLeft, CreditCard, Plus, Minus, Sparkles, Activity, Lock } from 'lucide-react';
import type { CartItem, GroupBuyProgressItem } from '../types';
import { findProgressItem, remainingForProduct } from '../utils/groupBuy';

interface CartProps {
  cartItems: CartItem[];
  updateQuantity: (index: number, quantity: number) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  onContinueShopping: () => void;
  onCheckout: () => void;
  isBatchOpen?: boolean;
  groupBuyItems?: GroupBuyProgressItem[];
}

const Cart: React.FC<CartProps> = ({
  cartItems,
  updateQuantity,
  removeFromCart,
  clearCart,
  getTotalPrice,
  onContinueShopping,
  onCheckout,
  isBatchOpen = true,
  groupBuyItems = [],
}) => {
  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
        <div className="text-center max-w-md">
          <div className="bg-white rounded-3xl p-12 border border-gray-100 shadow-clinical">
            <div className="bg-clinical-blue w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag className="w-10 h-10 text-charcoal-500" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-charcoal-900 mb-3 flex items-center justify-center gap-2">
              Your cart is empty
            </h2>
            <p className="text-gray-500 mb-8 max-w-xs mx-auto">
              Select products from our catalog to proceed with your research order.
            </p>
            <button
              onClick={onContinueShopping}
              className="btn-primary w-full flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
            >
              <ArrowLeft className="w-4 h-4" />
              Browse Catalog
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalPrice = getTotalPrice();
  // Shipping fee will be discussed via chat
  const finalTotal = totalPrice;

  // Group-buy gating: block checkout if no batch is open, or if a product's
  // total quantity in the cart exceeds what its batch cap still allows. The
  // database trigger is the authoritative backstop; this is the friendly,
  // pre-submit guard.
  const cartQtyByProduct = cartItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.product.id] = (acc[item.product.id] || 0) + item.quantity;
    return acc;
  }, {});
  const overCapProducts = Object.entries(cartQtyByProduct)
    .filter(([productId, qty]) => {
      const remaining = remainingForProduct(findProgressItem(groupBuyItems, productId));
      return remaining != null && qty > remaining;
    })
    .map(([productId]) => cartItems.find((i) => i.product.id === productId)?.product.name || 'an item');
  const capBlocked = overCapProducts.length > 0;
  const checkoutDisabled = !isBatchOpen || capBlocked;

  return (
    <div className="min-h-screen bg-white py-6 md:py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onContinueShopping}
            className="text-gray-500 hover:text-charcoal-600 font-medium mb-6 flex items-center gap-2 transition-colors group text-sm"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Catalog</span>
          </button>
          <div className="flex justify-between items-end pb-4 border-b border-gray-100">
            <div>
              <h1 className="font-heading text-2xl md:text-3xl font-bold text-charcoal-900 flex items-center gap-3">
                Shopping Cart
                <span className="text-sm font-normal text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  {cartItems.reduce((sum, item) => sum + item.quantity, 0)} Items
                </span>
              </h1>
            </div>
            <button
              onClick={clearCart}
              className="text-red-500 hover:text-red-600 text-sm font-medium flex items-center gap-2 hover:bg-red-50 px-3 py-2 rounded transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear Cart
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {cartItems.map((item, index) => (
              <div
                key={index}
                className="bg-white rounded p-4 md:p-6 border border-gray-100 shadow-sm transition-all hover:border-charcoal-200 hover:shadow-clinical"
              >
                <div className="flex gap-6">
                  {/* Product Image */}
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-secondary-50 rounded flex-shrink-0 border border-gray-100 overflow-hidden">
                    {item.product.image_url ? (
                      <img
                        src={item.product.image_url}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-charcoal-200 font-bold text-2xl bg-clinical-blue/30">
                        {item.product.name.charAt(0)}
                      </div>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-heading font-bold text-charcoal-900 text-base md:text-lg mb-1">
                          {item.product.name}
                        </h3>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {item.variation && (
                            <span className="text-gray-600 font-medium bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                              Format: {item.variation.name}
                            </span>
                          )}
                          {item.product.purity_percentage && item.product.purity_percentage > 0 && (
                            <span className="text-emerald-600 font-medium flex items-center gap-1 bg-emerald-600/10 px-2 py-0.5 rounded">
                              <Sparkles className="w-3 h-3" />
                              {item.product.purity_percentage}% Purity
                            </span>
                          )}

                        </div>
                      </div>
                      <button
                        onClick={() => removeFromCart(index)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quantity and Price */}
                    <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4">
                      {/* Qty Control */}
                      <div className="flex items-center border border-gray-200 rounded bg-gray-50">
                        <button
                          onClick={() => updateQuantity(index, item.quantity - 1)}
                          className="p-2 hover:bg-gray-100 transition-colors rounded-l text-gray-600"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-10 text-center font-bold text-charcoal-900 text-sm">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => {
                            const availableStock = item.variation ? item.variation.stock_quantity : item.product.stock_quantity;
                            if (item.quantity >= availableStock) {
                              alert(`Only ${availableStock} item(s) available in stock.`);
                              return;
                            }
                            updateQuantity(index, item.quantity + 1);
                          }}
                          disabled={(() => {
                            const availableStock = item.variation ? item.variation.stock_quantity : item.product.stock_quantity;
                            return item.quantity >= availableStock;
                          })()}
                          className="p-2 hover:bg-gray-100 transition-colors rounded-r text-gray-600 disabled:opacity-50"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right">
                        {(() => {
                          // Calculate base and original price
                          const basePrice = item.variation ? item.variation.price : item.product.base_price;
                          let currentPrice = basePrice;

                          // Check if this item is discounted
                          const isDiscounted = item.variation
                            ? (item.variation.discount_active && item.variation.discount_price !== null && item.variation.discount_price < basePrice)
                            : (item.product.discount_active && item.product.discount_price !== null && item.product.discount_price < item.product.base_price);

                          if (isDiscounted) {
                            currentPrice = item.variation?.discount_price || item.product.discount_price || basePrice;
                          }

                          return (
                            <>
                              <div className="text-lg md:text-xl font-bold text-charcoal-900">
                                ₱{(currentPrice * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                              </div>
                              {isDiscounted && (
                                <div className="text-xs text-gray-400 line-through">
                                  ₱{(basePrice * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                                </div>
                              )}
                              <div className="text-xs text-gray-400">
                                ₱{currentPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })} / unit
                                {isDiscounted && (
                                  <span className="ml-1 text-emerald-600 font-medium">
                                    ({Math.round((1 - currentPrice / basePrice) * 100)}% off)
                                  </span>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded shadow-clinical p-6 sticky top-24 border border-gray-100">
              <h2 className="font-heading text-lg font-bold text-charcoal-900 mb-6 flex items-center gap-2">
                Order Summary
                <Activity className="w-4 h-4 text-emerald-600" />
              </h2>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600 text-sm">
                  <span>Subtotal</span>
                  <span className="font-semibold text-charcoal-900">₱{totalPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span>
                </div>

                <div className="pt-3 border-t border-gray-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-base font-bold text-charcoal-900">Total Estimate</span>
                    <span className="text-2xl font-bold text-charcoal-900">
                      ₱{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 text-right font-normal">+ Shipping calculated at checkout</p>
                </div>
              </div>

              <div className="bg-clinical-blue/30 rounded p-4 mb-6 border border-charcoal-100">
                <p className="text-xs text-charcoal-700 font-medium mb-2">Shipping Information:</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li className="flex justify-between"><span>Metro Manila</span> <span className="font-medium">₱150</span></li>
                  <li className="flex justify-between"><span>Provincial</span> <span className="font-medium">₱200</span></li>
                </ul>
              </div>

              {!isBatchOpen && (
                <div className="mb-3 flex items-start gap-2 rounded bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>No group buy is open right now. Checkout will reopen once the next batch starts.</span>
                </div>
              )}
              {isBatchOpen && capBlocked && (
                <div className="mb-3 rounded bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                  The group limit was reached for {overCapProducts.join(', ')}. Lower the quantity to continue.
                </div>
              )}

              <button
                onClick={onCheckout}
                disabled={checkoutDisabled}
                className="w-full btn-primary py-3 md:py-4 text-sm md:text-base mb-3 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CreditCard className="w-4 h-4" />
                {!isBatchOpen ? 'Checkout closed' : 'Proceed to Checkout'}
              </button>

              <button
                onClick={onContinueShopping}
                className="w-full btn-secondary py-3 text-sm flex items-center justify-center gap-2"
              >
                Continue Browsing
              </button>

              {/* Trust Badges */}
              <div className="mt-6 pt-6 border-t border-gray-100 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-4 h-4 rounded-full bg-emerald-600/10 flex items-center justify-center text-emerald-600">✓</div>
                  <span>Secure Encrypted Checkout</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-4 h-4 rounded-full bg-emerald-600/10 flex items-center justify-center text-emerald-600">✓</div>
                  <span>HPLC Verified Purity</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-4 h-4 rounded-full bg-emerald-600/10 flex items-center justify-center text-emerald-600">✓</div>
                  <span>Discreet Packaging</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
