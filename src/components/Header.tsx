import React, { useState } from 'react';
import { ShoppingCart, Menu, X, FlaskConical, HelpCircle, Truck, Calculator, Shield, Lock, Check, Star } from 'lucide-react';
import { useFeatureFlagsContext } from '../contexts/FeatureFlagsContext';
import type { FeatureFlags, FeatureId } from '../utils/featureFlags';

interface NavItem {
  feature: FeatureId;
  /** Full label, used in the side navigation drawer. */
  label: string;
  /** Shorter label for the space-constrained desktop bar. Defaults to `label`. */
  shortLabel?: string;
  /** Destination, or null for Products, which returns to the storefront. */
  href: string | null;
  Icon: typeof FlaskConical;
}

/**
 * The site navigation, in order. Rendering both the desktop bar and the side
 * drawer from one list keeps them from drifting apart, and means a feature
 * switched off in Admin -> Features disappears from both at once.
 */
const NAV_ITEMS: readonly NavItem[] = [
  { feature: 'products', label: 'Products', href: null, Icon: FlaskConical },
  { feature: 'calculator', label: 'Calculator', href: '/calculator', Icon: Calculator },
  { feature: 'protocols', label: 'Protocols', href: '/protocols', Icon: FlaskConical },
  { feature: 'track_order', label: 'Track Order', shortLabel: 'Track', href: '/track-order', Icon: Truck },
  { feature: 'faq', label: 'FAQ', href: '/faq', Icon: HelpCircle },
  { feature: 'lab_reports', label: 'Lab Reports', href: '/coa', Icon: Shield },
  { feature: 'reviews', label: 'Customer Reviews', shortLabel: 'Reviews', href: '/reviews', Icon: Star },
];

interface HeaderProps {
  cartItemsCount: number;
  onCartClick: () => void;
  onMenuClick: () => void;
  /**
   * Opens the access flow. Omitted by pages that do not own access state — the
   * pill is then left out rather than rendered with a status it cannot vouch
   * for (and a handler that would throw on tap).
   */
  onGetAccess?: () => void;
  isVerified?: boolean;
  hideMobileStorefrontActions?: boolean;
  /** Overrides the live flags. Only tests and previews need this. */
  features?: Partial<FeatureFlags>;
}

const Header: React.FC<HeaderProps> = ({
  cartItemsCount,
  onCartClick,
  onMenuClick,
  onGetAccess,
  isVerified = false,
  hideMobileStorefrontActions = false,
  features,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { flags } = useFeatureFlagsContext();
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => features?.[item.feature] ?? flags[item.feature],
  );

  return (
    <>
      <header className="bg-white/95 backdrop-blur-sm sticky top-0 z-50 border-b border-brand-100">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Logo - Rectangular */}
            <button
              onClick={() => { onMenuClick(); setMobileMenuOpen(false); }}
              className="flex items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <img
                src="/logo.png"
                alt="Pure Peps"
                className="h-9 sm:h-10 w-auto object-contain"
              />
              <span className="text-base sm:text-xl font-display font-extrabold text-sakura-ink tracking-[-0.03em]">
                Pure Peps
              </span>
            </button>

            {/* Right Side Navigation */}
            <div className="flex items-center gap-2 md:gap-6 ml-auto">
              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-1 lg:gap-2" aria-label="Main navigation">
                {visibleNavItems.map(({ feature, label, shortLabel, href, Icon }) => {
                  const className =
                    'text-sm font-medium text-charcoal-600 hover:text-brand-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2';

                  return href === null ? (
                    <button key={feature} onClick={onMenuClick} className={className}>
                      <Icon className="w-4 h-4" />
                      {shortLabel ?? label}
                    </button>
                  ) : (
                    <a key={feature} href={href} className={className}>
                      <Icon className="w-4 h-4" />
                      {shortLabel ?? label}
                    </a>
                  );
                })}
              </nav>

              {/* Cart Button */}
              <button
                onClick={onCartClick}
                aria-label="View cart"
                className={`${hideMobileStorefrontActions ? 'hidden md:block ' : ''}relative p-2.5 text-sakura-ink hover:bg-sakura-blush-soft rounded-xl transition-colors`}
              >
                <ShoppingCart className="w-5 h-5" />
                {cartItemsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-sakura-primary text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {cartItemsCount > 99 ? '99+' : cartItemsCount}
                  </span>
                )}
              </button>

              {/* Get Access / Verified pill */}
              {onGetAccess && (
                <button
                  onClick={onGetAccess}
                  className={`hidden sm:inline-flex items-center gap-1.5 font-mono rounded-full px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors ${
                    isVerified
                      ? 'bg-sakura-sage-soft text-sakura-sage'
                      : 'bg-sakura-ink text-white hover:bg-sakura-deep'
                  }`}
                >
                  {isVerified ? <Check className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {isVerified ? 'Member' : 'Get access'}
                </button>
              )}

              {/* Mobile Menu Button — always present below md.
                  Deliberately NOT gated on hideMobileStorefrontActions: that
                  prop suppresses the CART, and the drawer behind this button
                  holds navigation only. Gating it here left Calculator,
                  Protocols and the non-storefront views with no way to reach
                  any other page on a phone. */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2.5 text-charcoal-700 hover:bg-brand-50 rounded-xl transition-colors"
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Menu — opens from the button above, on every page. */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-charcoal-900/30 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Sidebar Drawer */}
          <div
            className="absolute top-0 right-0 bottom-0 w-[300px] bg-white shadow-2xl border-l border-brand-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-5 border-b border-brand-100">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="Pure Peps"
                  className="h-8 w-auto object-contain rounded-md"
                />
                <span className="text-lg font-heading font-bold text-brand-600">
                  Pure Peps
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-charcoal-500 hover:text-rose-500 transition-colors rounded-lg hover:bg-brand-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Items */}
            <nav className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col space-y-1">
                {visibleNavItems.map(({ feature, label, href, Icon }) => {
                  const className =
                    'flex items-center gap-3 p-4 rounded-xl text-left font-medium text-charcoal-800 hover:bg-brand-50 transition-colors';
                  const icon = (
                    <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
                      <Icon className="w-[18px] h-[18px]" />
                    </div>
                  );

                  return href === null ? (
                    <button
                      key={feature}
                      onClick={() => {
                        onMenuClick();
                        setMobileMenuOpen(false);
                      }}
                      className={className}
                    >
                      {icon}
                      {label}
                    </button>
                  ) : (
                    <a key={feature} href={href} className={className}>
                      {icon}
                      {label}
                    </a>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
