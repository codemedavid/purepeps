import React, { useState, useRef } from 'react';
import MenuItemCard from './MenuItemCard';
import Hero from './Hero';
import ProductDetailModal from './ProductDetailModal';
import type { Product, ProductVariation, CartItem, GroupBuyProgressItem } from '../types';
import { Search, Lock, ShieldCheck } from 'lucide-react';
import { findProgressItem } from '../utils/groupBuy';

interface MenuProps {
  menuItems: Product[];
  /** True while the catalog is still being fetched, so we show a loader instead of an empty state. */
  isLoading?: boolean;
  addToCart: (product: Product, variation?: ProductVariation, quantity?: number) => void;
  cartItems: CartItem[];
  updateQuantity: (index: number, quantity: number) => void;
  isVerified: boolean;
  /** Whether the verified member's tier unlocks checkout for a given category. */
  canAccessCategory?: (categoryId: string | null | undefined) => boolean;
  tierName?: string | null;
  onGetAccess: () => void;
  groupBuyItems?: GroupBuyProgressItem[];
  isBatchOpen?: boolean;
  batchNumber?: number | null;
  batchStartsAt?: string | null;
  batchEndsAt?: string | null;
}

const Menu: React.FC<MenuProps> = ({
  menuItems,
  isLoading = false,
  addToCart,
  cartItems,
  isVerified,
  canAccessCategory,
  onGetAccess,
  groupBuyItems = [],
  isBatchOpen = true,
  batchNumber = null,
  batchStartsAt = null,
  batchEndsAt = null,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const productsRef = useRef<HTMLDivElement | null>(null);

  const filteredProducts = menuItems.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return a.name.localeCompare(b.name);
  });

  const getCartQuantity = (productId: string) =>
    cartItems
      .filter((item) => item.product.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);

  const scrollToProducts = () =>
    productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(product, variation, quantity) => addToCart(product, variation, quantity)}
          isVerified={isVerified}
          canCheckout={
            canAccessCategory ? canAccessCategory(selectedProduct.category) : isVerified
          }
          onGetAccess={onGetAccess}
          groupBuyItem={findProgressItem(groupBuyItems, selectedProduct.id)}
          cartQuantity={getCartQuantity(selectedProduct.id)}
          isBatchOpen={isBatchOpen}
        />
      )}

      <div className="min-h-screen bg-sakura-canvas font-display">
        <Hero
          onShopAll={scrollToProducts}
          onGetAccess={onGetAccess}
          batchNumber={batchNumber}
          startsAt={batchStartsAt}
          endsAt={batchEndsAt}
          isBatchOpen={isBatchOpen}
        />

        <div className="max-w-[1180px] mx-auto px-6 pb-10" ref={productsRef}>
          {/* Access bar — shown until the member is verified */}
          {!isVerified && (
            <div className="flex items-center justify-between gap-6 px-6 py-[18px] bg-sakura-ink rounded-[18px] mb-8 flex-wrap">
              <div className="flex items-center gap-3.5 text-white">
                <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-full bg-white/10 text-sakura-light">
                  <Lock className="w-[15px] h-[15px]" />
                </span>
                <div>
                  <div className="text-[15px] font-semibold tracking-[-0.01em]">
                    Checkout is members only
                  </div>
                  <div className="font-mono text-[11.5px] tracking-[0.03em] text-sakura-soft">
                    Pay the one-time access fee to join group buys.
                  </div>
                </div>
              </div>
              <button
                onClick={onGetAccess}
                className="inline-flex items-center gap-2 bg-sakura-primary hover:bg-sakura-light text-white rounded-full px-5 py-3 text-sm font-semibold transition-colors"
              >
                <Lock className="w-3.5 h-3.5" /> Get access
              </button>
            </div>
          )}

          {/* Heading + search */}
          <div className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
            <h2 className="m-0 text-3xl sm:text-4xl font-extrabold tracking-[-0.035em] text-sakura-ink">
              Catalog
            </h2>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sakura-soft w-4 h-4" />
              <input
                type="text"
                placeholder="Search catalog…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 rounded-full bg-white border border-sakura-ink/10 text-sm text-sakura-ink placeholder:text-sakura-soft focus:outline-none focus:ring-2 focus:ring-sakura-primary/30"
              />
            </div>
          </div>

          {/* Grid */}
          {isLoading && sortedProducts.length === 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5" aria-busy="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-[18px] bg-sakura-ink/5 animate-pulse aspect-[3/4]"
                />
              ))}
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="text-center py-20 text-sakura-faint">
              No products match {searchQuery ? `"${searchQuery}"` : 'your search'}.
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {sortedProducts.map((product) => (
                <MenuItemCard
                  key={product.id}
                  product={product}
                  cartQuantity={getCartQuantity(product.id)}
                  onProductClick={setSelectedProduct}
                  onAddToCart={addToCart}
                  isVerified={isVerified}
                  canCheckout={canAccessCategory ? canAccessCategory(product.category) : isVerified}
                  onGetAccess={onGetAccess}
                  groupBuyItem={findProgressItem(groupBuyItems, product.id)}
                  isBatchOpen={isBatchOpen}
                />
              ))}
            </div>
          )}
        </div>

        {/* Verify band */}
        {!isVerified && (
          <div className="max-w-[1180px] mx-auto px-6 pb-24 pt-10">
            <div className="relative overflow-hidden bg-sakura-dark rounded-[28px] px-8 py-16 text-center">
              <div className="relative max-w-xl mx-auto">
                <div className="font-mono text-xs font-semibold tracking-[0.1em] uppercase text-sakura-light mb-4">
                  Members only checkout
                </div>
                <h2 className="m-0 text-4xl font-extrabold tracking-[-0.04em] text-white leading-tight">
                  Get access to check out.
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-white/70">
                  Browsing is open to all. To join a group buy, pay the one-time access fee, attach
                  your payment screenshot, and an admin confirms your access — usually within a few
                  hours.
                </p>
                <button
                  onClick={onGetAccess}
                  className="inline-flex items-center gap-2 mt-8 bg-sakura-primary hover:bg-sakura-light text-white rounded-full px-7 py-3.5 text-base font-semibold transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" /> Get access
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Menu;
