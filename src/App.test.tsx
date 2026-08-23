import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

// The storefront shell pulls its data from Supabase-backed hooks. This journey is
// about navigation state, so each data source is stubbed to a quiet, empty result
// and only the navigation wiring is exercised for real.
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));

vi.mock('./components/StorefrontNoticeGate', () => ({ default: () => null }));

vi.mock('./hooks/useMenu', () => ({
  useMenu: () => ({ menuItems: [], products: [], loading: false, error: null }),
}));

vi.mock('./hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [],
    freeCategoryIds: new Set<string>(),
    loading: false,
    error: null,
  }),
}));

vi.mock('./hooks/useGroupBuyProgress', () => ({
  useGroupBuyProgress: () => ({
    progress: { items: [], batch: null },
    items: [],
    batch: null,
    isBatchOpen: true,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('./hooks/useCart', () => ({
  useCart: () => ({
    cartItems: [],
    addToCart: vi.fn(),
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
    getTotalPrice: () => 0,
    getTotalItems: () => 0,
  }),
}));

// Feature visibility is a settings read; this journey is about navigation, so
// the flags resolve immediately with every feature on.
vi.mock('./contexts/FeatureFlagsContext', () => ({
  FeatureFlagsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useFeatureFlagsContext: () => ({
    flags: {
      products: true,
      calculator: true,
      protocols: true,
      track_order: true,
      faq: true,
      lab_reports: true,
    },
    loading: false,
    error: null,
    setFeatureEnabled: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock('./contexts/AccessContext', () => ({
  AccessProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAccessContext: () => ({
    email: null,
    isVerified: false,
    checking: false,
    verifyEmail: vi.fn(),
    watchPendingEmail: vi.fn(),
    signOut: vi.fn(),
    grant: { tierName: null },
    tierName: null,
    hasAllAccess: false,
    accessibleCategoryIds: new Set<string>(),
    canAccessCategory: () => false,
    needsRenewal: false,
    renewalEmail: null,
  }),
}));

/** A tab inside the mobile bottom navigation, scoped so the header's buttons never match. */
const bottomNavTab = (name: 'Home' | 'Shop' | 'Cart') =>
  within(screen.getByRole('navigation', { name: 'Storefront' })).getByRole('button', {
    name: name === 'Cart' ? /^Cart,/ : name,
  });

/** Elements the storefront asked to scroll into view, in call order. */
let scrollTargets: Element[] = [];

describe('Storefront bottom navigation', () => {
  beforeEach(() => {
    // jsdom implements neither scroll API; the storefront calls both while navigating.
    window.scrollTo = vi.fn();
    scrollTargets = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrollTargets.push(this);
    });
  });

  it('highlights Home on first load', () => {
    render(<App />);

    expect(bottomNavTab('Home')).toHaveAttribute('aria-current', 'page');
    expect(bottomNavTab('Shop')).not.toHaveAttribute('aria-current');
  });

  it('highlights Shop instead of Home after the hero Browse the catalog button is used', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /browse the catalog/i }));

    expect(bottomNavTab('Shop')).toHaveAttribute('aria-current', 'page');
    expect(bottomNavTab('Home')).not.toHaveAttribute('aria-current');
  });

  it('highlights Shop instead of Home after the empty cart Browse Catalog button is used', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(bottomNavTab('Cart'));
    await user.click(screen.getByRole('button', { name: /browse catalog/i }));

    expect(bottomNavTab('Shop')).toHaveAttribute('aria-current', 'page');
    expect(bottomNavTab('Home')).not.toHaveAttribute('aria-current');
  });

  it('scrolls down into the catalog from the hero CTA rather than back up the page', async () => {
    const user = userEvent.setup();
    render(<App />);

    const heroHeading = screen.getByRole('heading', { level: 1 });

    await user.click(screen.getByRole('button', { name: /browse the catalog/i }));
    await waitFor(() => expect(scrollTargets).toHaveLength(1));

    // The shopper must end up below the hero. An element that precedes the hero
    // (the catalog anchor sits above it) would scroll the page back to the top and
    // leave the products just as far away as before.
    expect(
      heroHeading.compareDocumentPosition(scrollTargets[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
