import React, { useState } from 'react';
import { ImageIcon, Lock, ShoppingBag } from 'lucide-react';
import type { Product, ProductVariation, GroupBuyProgressItem } from '../types';
import { formatPrice } from '../utils/currency';
import { isSoldOut as isCapSoldOut } from '../utils/groupBuy';

interface MenuItemCardProps {
  product: Product;
  onAddToCart?: (product: Product, variation?: ProductVariation, quantity?: number) => void;
  cartQuantity?: number;
  onUpdateQuantity?: (index: number, quantity: number) => void;
  onProductClick?: (product: Product) => void;
  isVerified?: boolean;
  onGetAccess?: () => void;
  groupBuyItem?: GroupBuyProgressItem;
  isBatchOpen?: boolean;
}

const MenuItemCard: React.FC<MenuItemCardProps> = ({
  product,
  onAddToCart,
  cartQuantity = 0,
  onProductClick,
  isVerified = false,
  onGetAccess,
  groupBuyItem,
  isBatchOpen = true,
}) => {
  const [imageError, setImageError] = useState(false);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | undefined>(
    product.variations && product.variations.length > 0 ? product.variations[0] : undefined,
  );

  const currentPrice = selectedVariation
    ? selectedVariation.discount_active && selectedVariation.discount_price
      ? selectedVariation.discount_price
      : selectedVariation.price
    : product.discount_active && product.discount_price
      ? product.discount_price
      : product.base_price;

  const originalPrice = selectedVariation ? selectedVariation.price : product.base_price;
  const hasDiscount = currentPrice < originalPrice;
  const savePct = hasDiscount ? Math.round((1 - currentPrice / originalPrice) * 100) : 0;

  const hasAnyStock =
    product.variations && product.variations.length > 0
      ? product.variations.some((v) => v.stock_quantity > 0)
      : product.stock_quantity > 0;
  const soldOut = !product.available || !hasAnyStock;

  // Group-buy cap (per product, across the whole batch). cap_quantity null = no cap.
  const capQuantity = groupBuyItem?.cap_quantity ?? null;
  const capReserved = groupBuyItem?.total_quantity ?? 0;
  const capReached = isCapSoldOut(groupBuyItem);
  const canAdd = !soldOut && !capReached && isBatchOpen;
  const ctaLabel = !isBatchOpen
    ? 'Group buy closed'
    : soldOut
      ? 'Sold out'
      : capReached
        ? 'Group limit reached'
        : 'Add to cart';

  return (
    <div
      onClick={() => onProductClick?.(product)}
      className="relative bg-white border border-sakura-ink/[0.08] rounded-[20px] overflow-hidden cursor-pointer transition-shadow duration-300 hover:shadow-[0_20px_44px_-26px_rgba(60,20,35,0.34)] font-display flex flex-col"
    >
      {/* Image */}
      <div className="relative h-44 sm:h-[238px] bg-sakura-blush-soft border-b border-sakura-edge overflow-hidden">
        {product.image_url && !imageError ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-sakura-soft gap-2">
            <ImageIcon className="w-8 h-8" />
            <span className="text-xs">Add product photo</span>
          </div>
        )}

        {(product.featured || hasDiscount) && (
          <span className="absolute top-4 left-4 z-20 font-mono text-[10px] font-semibold tracking-[0.06em] uppercase text-white bg-sakura-primary rounded-full px-2.5 py-1 whitespace-nowrap">
            {product.featured ? 'Best seller' : `${savePct}% off`}
          </span>
        )}

        {product.sequence && (
          <span className="absolute bottom-3.5 left-4 z-20 font-mono text-[10px] tracking-[0.08em] uppercase text-sakura-deep bg-white/[0.86] rounded-md px-2 py-1">
            {product.sequence}
          </span>
        )}

        {soldOut && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-20">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-sakura-muted bg-white px-3 py-1 rounded-full border border-sakura-ink/10">
              {!product.available ? 'Unavailable' : 'Out of stock'}
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="p-5 sm:p-[22px] flex-1 flex flex-col">
        <div className="text-lg sm:text-xl font-extrabold tracking-[-0.025em] text-sakura-ink leading-tight line-clamp-1">
          {product.name}
        </div>
        <div className="text-[13px] text-sakura-faint mt-0.5 line-clamp-1">{product.description}</div>

        <div className="flex flex-wrap gap-1.5 mt-3.5">
          {selectedVariation && (
            <span className="font-mono text-[11px] font-medium text-sakura-muted bg-[#F2EFED] rounded-md px-2.5 py-1.5">
              {selectedVariation.name}
            </span>
          )}
          {product.purity_percentage > 0 && (
            <span className="font-mono text-[11px] font-medium text-sakura-sage bg-sakura-sage-soft rounded-md px-2.5 py-1.5">
              {product.purity_percentage}% HPLC
            </span>
          )}
        </div>

        {/* extra variation chips */}
        {product.variations && product.variations.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {product.variations.slice(0, 3).map((v) => (
              <button
                key={v.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (v.stock_quantity > 0) setSelectedVariation(v);
                }}
                disabled={v.stock_quantity === 0}
                className={`font-mono text-[10px] px-2 py-1 rounded-md border transition-colors ${
                  selectedVariation?.id === v.id
                    ? 'border-sakura-primary text-sakura-primary bg-sakura-blush-soft'
                    : 'border-sakura-ink/10 text-sakura-muted hover:border-sakura-primary/40'
                } ${v.stock_quantity === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {v.name}
              </button>
            ))}
          </div>
        )}

        <div className="h-px bg-sakura-ink/[0.08] my-4" />

        <div className="flex items-end justify-between mt-auto">
          <div>
            <div className="font-mono text-[10px] font-semibold tracking-[0.06em] uppercase text-sakura-soft">
              Group price
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl sm:text-[26px] font-semibold text-sakura-primary tracking-[-0.01em]">
                {formatPrice(currentPrice)}
              </span>
              {hasDiscount && (
                <span className="font-mono text-[13px] text-sakura-soft line-through">
                  {formatPrice(originalPrice)}
                </span>
              )}
            </div>
          </div>
          {hasDiscount && (
            <span className="font-mono text-xs font-semibold text-sakura-sage">−{savePct}%</span>
          )}
        </div>

        {/* Group-buy limit progress — lets shoppers see how many can still be bought */}
        {capQuantity != null && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
              <span className="text-sakura-soft uppercase tracking-[0.06em]">Group limit</span>
              <span className={capReached ? 'text-sakura-primary font-semibold' : 'text-sakura-muted'}>
                {capReserved} / {capQuantity} reserved
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#F2EFED] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${capReached ? 'bg-sakura-primary' : 'bg-sakura-sage'}`}
                style={{ width: `${Math.min(100, Math.round((capReserved / capQuantity) * 100))}%` }}
              />
            </div>
          </div>
        )}

        {/* CTA — gated on access */}
        {isVerified ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!canAdd) return;
              if (product.variations && product.variations.length > 0 && !selectedVariation) {
                onProductClick?.(product);
                return;
              }
              onAddToCart?.(product, selectedVariation, 1);
            }}
            disabled={!canAdd}
            className={`mt-4 w-full flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition-colors ${
              !canAdd
                ? 'bg-[#F2EFED] text-sakura-soft cursor-not-allowed'
                : 'bg-sakura-primary hover:bg-sakura-deep text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> {ctaLabel}
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGetAccess?.();
            }}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold bg-[#F2EFED] text-[#A89098] hover:text-sakura-deep transition-colors"
          >
            <Lock className="w-4 h-4" /> Members only
          </button>
        )}

        {cartQuantity > 0 && (
          <div className="mt-2 text-center text-[11px] text-sakura-sage font-medium">
            {cartQuantity} in cart
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuItemCard;
