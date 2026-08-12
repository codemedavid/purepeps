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
  'relative flex min-h-[64px] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold leading-none transition-colors duration-150 motion-reduce:transition-none',
  active
    ? 'text-sakura-primary before:absolute before:left-1/2 before:top-0 before:h-0.5 before:w-8 before:-translate-x-1/2 before:rounded-b-full before:bg-sakura-primary'
    : 'text-sakura-muted hover:text-sakura-deep',
].join(' ');

const iconClassName = 'h-5 w-5 shrink-0';

const handleRouteNavigation = () => {
  window.scrollTo({ top: 0, behavior: 'auto' });
};

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

      <button
        type="button"
        onClick={onCart}
        aria-label={cartLabel}
        aria-current={cartIsCurrent ? 'page' : undefined}
        className={itemClassName(cartIsCurrent)}
      >
        <ShoppingCart aria-hidden="true" className={iconClassName} strokeWidth={1.8} />
        <span>Cart</span>
        {cartItemCount > 0 && (
          <span
            data-testid="bottom-nav-cart-badge"
            className="absolute left-1/2 top-1 ml-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-sakura-primary px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
          >
            {visibleCartCount}
          </span>
        )}
      </button>

      <Link to="/track-order" onClick={handleRouteNavigation} className={itemClassName(false)}>
        <ClipboardList aria-hidden="true" className={iconClassName} strokeWidth={1.8} />
        <span>Orders</span>
      </Link>

      <Link to="/protocols" onClick={handleRouteNavigation} className={itemClassName(false)}>
        <BookOpen aria-hidden="true" className={iconClassName} strokeWidth={1.8} />
        <span>Guides</span>
      </Link>
    </nav>
  );
};

export default StorefrontBottomNav;
