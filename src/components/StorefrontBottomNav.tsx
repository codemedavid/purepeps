import React from 'react';
import { BookOpen, ClipboardList, Home, Shield, ShoppingCart, Store } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  GUIDES_PATH,
  LAB_REPORTS_PATH,
  ORDERS_PATH,
  STOREFRONT_PATH,
} from '../utils/storefrontNavigation';

export type StorefrontView = 'menu' | 'cart' | 'checkout' | 'access';
export type MenuDestination = 'home' | 'shop';

export interface StorefrontBottomNavProps {
  activeView: StorefrontView;
  menuDestination: MenuDestination;
  cartItemCount: number;
  /**
   * Whether each optional destination is switched on for the site. Owned by the
   * caller (see Admin -> Features) so this stays a presentational component: a
   * tab whose page is switched off must not remain tappable here, or it would
   * silently bounce the customer back to the storefront.
   */
  showLabReports: boolean;
  showOrders: boolean;
  showGuides: boolean;
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

// Home, Shop and Cart are always present; the other three are switchable.
const BASE_COLUMN_COUNT = 3;

// Every column count is written out in full so Tailwind's scanner emits them.
const GRID_COLUMN_CLASS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

const navClassName = (optionalTabCount: number) => [
  'fixed inset-x-0 bottom-0 z-50 grid border-t border-sakura-edge bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(23,16,13,0.08)] backdrop-blur-md md:hidden',
  GRID_COLUMN_CLASS[BASE_COLUMN_COUNT + optionalTabCount],
].join(' ');

const handleRouteNavigation = () => {
  window.scrollTo({ top: 0, behavior: 'auto' });
};

const StorefrontBottomNav: React.FC<StorefrontBottomNavProps> = ({
  activeView,
  menuDestination,
  cartItemCount,
  showLabReports,
  showOrders,
  showGuides,
  onHome,
  onShop,
  onCart,
}) => {
  const { pathname } = useLocation();

  // Home, Shop, and Cart are views inside the storefront route rather than
  // routes of their own, so none of them is current while a standalone public
  // page (Lab Reports, Orders, Guides, …) owns the screen.
  const onStorefront = pathname === STOREFRONT_PATH;
  const homeIsCurrent = onStorefront && activeView === 'menu' && menuDestination === 'home';
  const shopIsCurrent = onStorefront && activeView === 'menu' && menuDestination === 'shop';
  const cartIsCurrent = onStorefront && (activeView === 'cart' || activeView === 'checkout');
  const ordersIsCurrent = pathname === ORDERS_PATH;
  const guidesIsCurrent = pathname === GUIDES_PATH;
  const labReportsIsCurrent = pathname === LAB_REPORTS_PATH;

  // Drives the column count so the remaining tabs stay evenly spaced.
  const optionalTabCount = [showOrders, showGuides, showLabReports].filter(Boolean).length;

  const cartLabel = `Cart, ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`;
  const visibleCartCount = cartItemCount > 99 ? '99+' : cartItemCount;

  return (
    <nav aria-label="Storefront" className={navClassName(optionalTabCount)}>
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

      {showOrders && (
        <Link
          to={ORDERS_PATH}
          onClick={handleRouteNavigation}
          aria-current={ordersIsCurrent ? 'page' : undefined}
          className={itemClassName(ordersIsCurrent)}
        >
          <ClipboardList aria-hidden="true" className={iconClassName} strokeWidth={1.8} />
          <span>Orders</span>
        </Link>
      )}

      {showGuides && (
        <Link
          to={GUIDES_PATH}
          onClick={handleRouteNavigation}
          aria-current={guidesIsCurrent ? 'page' : undefined}
          className={itemClassName(guidesIsCurrent)}
        >
          <BookOpen aria-hidden="true" className={iconClassName} strokeWidth={1.8} />
          <span>Guides</span>
        </Link>
      )}

      {showLabReports && (
        <Link
          to={LAB_REPORTS_PATH}
          onClick={handleRouteNavigation}
          aria-current={labReportsIsCurrent ? 'page' : undefined}
          className={itemClassName(labReportsIsCurrent)}
        >
          <Shield aria-hidden="true" className={iconClassName} strokeWidth={1.8} />
          <span>Labs</span>
        </Link>
      )}
    </nav>
  );
};

export default StorefrontBottomNav;
