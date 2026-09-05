import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { DEFAULT_GB_LANDING } from './utils/gbLanding';

// The storefront shell pulls its data from Supabase-backed hooks. This journey is
// about navigation state, so each data source is stubbed to a quiet, empty result
// and only the navigation wiring is exercised for real.
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));

vi.mock('./components/StorefrontNoticeGate', () => ({ default: () => null }));

vi.mock('./hooks/useMenu', () => ({
  useMenu: () => ({ menuItems: [], products: [], loading: false, error: null }),
}));

// The landing copy is a settings read; the journey only needs it resolved.
vi.mock('./hooks/useGbLanding', () => ({
  useGbLanding: () => ({
    content: DEFAULT_GB_LANDING,
    loading: false,
    error: null,
    save: vi.fn(),
    refetch: vi.fn(),
  }),
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
      reviews: true,
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

/** A tab inside the mobile bottom navigation, scoped so header buttons never match. */
const bottomNavTab = (name: 'Home' | 'Shop') =>
  within(screen.getByRole('navigation', { name: 'Storefront' })).getByRole('button', { name });

const catalogHeading = () => screen.queryByRole('heading', { name: 'Catalog' });

/** Elements the storefront asked to scroll into view, in call order. */
let scrollTargets: Element[] = [];

beforeEach(() => {
  // jsdom implements neither scroll API; the storefront calls both while navigating.
  window.scrollTo = vi.fn();
  scrollTargets = [];
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrollTargets.push(this);
  });
});

describe('Homepage — the Group Buy landing is the only section', () => {
  it('opens on the Group Buy landing', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      DEFAULT_GB_LANDING.headline,
    );
    expect(screen.getByTestId('gb-status-badge')).toBeInTheDocument();
  });

  it('shows no catalog until a call to action asks for one', () => {
    render(<App />);

    expect(catalogHeading()).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Search catalog/i)).not.toBeInTheDocument();
  });

  it('reveals the catalog from the primary call to action', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId('gb-cta-primary'));

    expect(catalogHeading()).toBeInTheDocument();
  });

  it('opens the access flow from the secondary call to action', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId('gb-cta-secondary'));

    // The landing is replaced, not stacked underneath.
    expect(screen.queryByTestId('gb-cta-primary')).not.toBeInTheDocument();
    expect(catalogHeading()).not.toBeInTheDocument();
  });

  it('returns to the landing from the Home tab', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId('gb-cta-primary'));
    expect(catalogHeading()).toBeInTheDocument();

    await user.click(bottomNavTab('Home'));

    expect(catalogHeading()).not.toBeInTheDocument();
    expect(screen.getByTestId('gb-cta-primary')).toBeInTheDocument();
  });
});

describe('Storefront bottom navigation', () => {
  it('highlights Home on first load', () => {
    render(<App />);

    expect(bottomNavTab('Home')).toHaveAttribute('aria-current', 'page');
    expect(bottomNavTab('Shop')).not.toHaveAttribute('aria-current');
  });

  it('highlights Shop instead of Home after the primary call to action is used', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId('gb-cta-primary'));

    expect(bottomNavTab('Shop')).toHaveAttribute('aria-current', 'page');
    expect(bottomNavTab('Home')).not.toHaveAttribute('aria-current');
  });

  it('highlights Shop instead of Home after the empty cart Browse Catalog button is used', async () => {
    const user = userEvent.setup();
    render(<App />);

    // The cart is reached from the header now, not the bottom bar.
    await user.click(screen.getByRole('button', { name: 'View cart' }));
    await user.click(screen.getByRole('button', { name: /browse catalog/i }));

    expect(bottomNavTab('Shop')).toHaveAttribute('aria-current', 'page');
    expect(bottomNavTab('Home')).not.toHaveAttribute('aria-current');
  });

  it('scrolls to the catalog anchor from the primary call to action', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId('gb-cta-primary'));
    await waitFor(() => expect(scrollTargets.length).toBeGreaterThan(0));

    expect(scrollTargets[scrollTargets.length - 1]).toHaveAttribute('id', 'storefront-catalog');
  });

  it('scrolls the Shop tab to the same place the primary call to action does', async () => {
    // Two routes to "show me the products" that land in different places is the
    // shape of the bug fixed in 7d38677; pinning them together stops it returning.
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId('gb-cta-primary'));
    await waitFor(() => expect(scrollTargets.length).toBeGreaterThan(0));
    const fromCta = scrollTargets[scrollTargets.length - 1];

    await user.click(bottomNavTab('Home'));
    await user.click(bottomNavTab('Shop'));
    await waitFor(() =>
      expect(scrollTargets[scrollTargets.length - 1]).toHaveAttribute('id', 'storefront-catalog'),
    );

    expect(scrollTargets[scrollTargets.length - 1]).toBe(fromCta);
  });
});
