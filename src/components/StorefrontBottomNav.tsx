import React from 'react';
import { BookOpen, ClipboardList, Home, Shield, Star, Store } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  GUIDES_PATH,
  LAB_REPORTS_PATH,
  ORDERS_PATH,
  REVIEWS_PATH,
  STOREFRONT_PATH,
} from '../utils/storefrontNavigation';

/**
 * `landing` is the Group Buy homepage; `menu` is the product catalog reached
 * from its primary call to action.
 */
export type StorefrontView = 'landing' | 'menu' | 'cart' | 'checkout' | 'access';

export interface StorefrontBottomNavProps {
  activeView: StorefrontView;
  /**
   * Whether each optional destination is switched on for the site. Owned by the
   * caller (see Admin -> Features) so this stays a presentational component: a
   * tab whose page is switched off must not remain tappable here, or it would
   * silently bounce the customer back to the storefront.
   */
  showLabReports: boolean;
  showOrders: boolean;
  showGuides: boolean;
  showReviews: boolean;
  onHome: () => void;
  onShop: () => void;
}

const itemClassName = (active: boolean) => [
  'relative flex min-h-[64px] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold leading-none transition-colors duration-150 motion-reduce:transition-none',
  active
    ? 'text-sakura-primary before:absolute before:left-1/2 before:top-0 before:h-0.5 before:w-8 before:-translate-x-1/2 before:rounded-b-full before:bg-sakura-primary'
    : 'text-sakura-muted hover:text-sakura-deep',
].join(' ');

const iconClassName = 'h-5 w-5 shrink-0';

// Home and Shop are always present; the other four are switchable. The cart is
// deliberately NOT here — it lives in the header beside the burger menu, and a
// second entry would split one action across two places.
const BASE_COLUMN_COUNT = 2;

// z-40 keeps the bar UNDER full-screen overlays (the COA lightbox and
// ProductDetailModal are both fixed z-50). At an equal z-index the later DOM
// node wins, which put the bar on top of the lightbox with its tabs tappable
// through it — dismissing the image navigated away instead.

// Every column count is written out in full so Tailwind's scanner emits them.
const GRID_COLUMN_CLASS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

const navClassName = (optionalTabCount: number) => [
  'fixed inset-x-0 bottom-0 z-40 grid border-t border-sakura-edge bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(23,16,13,0.08)] backdrop-blur-md md:hidden',
  GRID_COLUMN_CLASS[BASE_COLUMN_COUNT + optionalTabCount],
].join(' ');

const handleRouteNavigation = () => {
  window.scrollTo({ top: 0, behavior: 'auto' });
};

const StorefrontBottomNav: React.FC<StorefrontBottomNavProps> = ({
  activeView,
  showLabReports,
  showOrders,
  showGuides,
  showReviews,
  onHome,
  onShop,
}) => {
  const { pathname } = useLocation();

  // Home and Shop are views inside the storefront route rather than routes of
  // their own, so neither is current while a standalone public page (Lab
  // Reports, Orders, Guides, Reviews, …) owns the screen. Cart, checkout and
  // access have no tab, so they mark nothing current.
  const onStorefront = pathname === STOREFRONT_PATH;
  const homeIsCurrent = onStorefront && activeView === 'landing';
  const shopIsCurrent = onStorefront && activeView === 'menu';
  const ordersIsCurrent = pathname === ORDERS_PATH;
  const guidesIsCurrent = pathname === GUIDES_PATH;
  const labReportsIsCurrent = pathname === LAB_REPORTS_PATH;
  const reviewsIsCurrent = pathname === REVIEWS_PATH;

  // Drives the column count so the remaining tabs stay evenly spaced.
  const optionalTabCount = [showOrders, showGuides, showLabReports, showReviews].filter(
    Boolean,
  ).length;

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

      {showReviews && (
        <Link
          to={REVIEWS_PATH}
          onClick={handleRouteNavigation}
          aria-current={reviewsIsCurrent ? 'page' : undefined}
          className={itemClassName(reviewsIsCurrent)}
        >
          <Star aria-hidden="true" className={iconClassName} strokeWidth={1.8} />
          <span>Reviews</span>
        </Link>
      )}
    </nav>
  );
};

export default StorefrontBottomNav;
