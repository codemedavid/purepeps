import React from 'react';
import { BookOpen, ClipboardList, Home, ShoppingCart, Store } from 'lucide-react';
import { Link } from 'react-router-dom';

export type StorefrontView = 'menu' | 'cart' | 'checkout' | 'access';
export type MenuDestination = 'home' | 'shop';

export interface StorefrontBottomNavProps {
  activeView: StorefrontView;
  menuDestination: MenuDestination;
  cartItemCount: number;
  onHome: () => void;
  onShop: () => void;
  onCart: () => void;
}

const itemClassName = (active: boolean) => [
  'flex min-h-[44px] w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold leading-none transition-colors duration-150 motion-reduce:transition-none',
  active
    ? 'text-sakura-primary'
    : 'text-sakura-muted hover:text-sakura-deep',
].join(' ');

const iconClassName = 'h-5 w-5 shrink-0';

const StorefrontBottomNav: React.FC<StorefrontBottomNavProps> = ({
  activeView,
  menuDestination,
  cartItemCount,
  onHome,
  onShop,
  onCart,
}) => {
  const homeIsCurrent = activeView === 'menu' && menuDestination === 'home';
  const shopIsCurrent = activeView === 'menu' && menuDestination === 'shop';
  const cartIsCurrent = activeView === 'cart' || activeView === 'checkout';
  const cartLabel = `Cart, ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`;
  const visibleCartCount = cartItemCount > 99 ? '99+' : cartItemCount;

  return (
    <nav
      aria-label="Storefront"
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-sakura-edge bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(23,16,13,0.08)] backdrop-blur-md md:hidden"
    >
      <button
        type="button"
        onClick={onHome}
        aria-current={homeIsCurrent ? 'page' : undefined}
        className={itemClassName(homeIsCurrent)}
      >
        <Home aria-hidden="true" className={iconClassName} strokeWidth={1.8} />
        <span>Home</span>
      </button>

      <button
        type="button"
        onClick={onShop}
        aria-current={shopIsCurrent ? 'page' : undefined}
        className={itemClassName(shopIsCurrent)}
      >
        <Store aria-hidden="true" className={iconClassName} strokeWidth={1.8} />
        <span>Shop</span>
      </button>

      <div className="flex min-h-[64px] items-start justify-center">
        <button
          type="button"
          onClick={onCart}
          aria-label={cartLabel}
          aria-current={cartIsCurrent ? 'page' : undefined}
          className="relative -mt-5 flex h-14 min-h-[44px] w-14 min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-full bg-sakura-primary text-white shadow-lg transition-transform duration-150 hover:bg-sakura-deep hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-primary focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          <ShoppingCart aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
          <span className="text-[10px] font-semibold leading-none">Cart</span>
          {cartItemCount > 0 && (
            <span
              data-testid="bottom-nav-cart-badge"
              className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-sakura-ink px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
            >
              {visibleCartCount}
            </span>
          )}
        </button>
      </div>

      <Link to="/track-order" className={itemClassName(false)}>
        <ClipboardList aria-hidden="true" className={iconClassName} strokeWidth={1.8} />
        <span>Orders</span>
      </Link>

      <Link to="/protocols" className={itemClassName(false)}>
        <BookOpen aria-hidden="true" className={iconClassName} strokeWidth={1.8} />
        <span>Guides</span>
      </Link>
    </nav>
  );
};

export default StorefrontBottomNav;
