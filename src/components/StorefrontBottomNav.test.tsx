import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import StorefrontBottomNav, { type StorefrontView } from './StorefrontBottomNav';

const renderNav = ({
  activeView = 'landing',
  showLabReports = true,
  showOrders = true,
  showGuides = true,
  showReviews = true,
  path = '/',
  onHome = vi.fn(),
  onShop = vi.fn(),
}: Partial<{
  activeView: StorefrontView;
  showLabReports: boolean;
  showOrders: boolean;
  showGuides: boolean;
  showReviews: boolean;
  path: string;
  onHome: () => void;
  onShop: () => void;
}> = {}) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <StorefrontBottomNav
        activeView={activeView}
        showLabReports={showLabReports}
        showOrders={showOrders}
        showGuides={showGuides}
        showReviews={showReviews}
        onHome={onHome}
        onShop={onShop}
      />
    </MemoryRouter>,
  );

  return { onHome, onShop };
};

const currentItems = () =>
  screen.getByRole('navigation', { name: 'Storefront' }).querySelectorAll('[aria-current="page"]');

describe('StorefrontBottomNav', () => {
  it('renders six destinations in a mobile-only storefront nav', () => {
    renderNav();

    const nav = screen.getByRole('navigation', { name: 'Storefront' });
    expect(nav).toHaveClass('md:hidden', 'fixed', 'grid-cols-6');
    // Below full-screen overlays (COA lightbox / ProductDetailModal are z-50),
    // or the bar paints over them and stays tappable through the backdrop.
    expect(nav).toHaveClass('z-40');
    expect(nav).not.toHaveClass('z-50');
    expect(nav.className).toContain('env(safe-area-inset-bottom)');
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shop' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/track-order');
    expect(screen.getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/protocols');
    expect(screen.getByRole('link', { name: 'Labs' })).toHaveAttribute('href', '/coa');
    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute('href', '/reviews');
  });

  // The cart lives in the header, next to the burger menu. Leaving a duplicate
  // here would give the same action two homes and cost a bottom-nav column.
  it('does not offer a cart tab', () => {
    renderNav();

    expect(screen.queryByRole('button', { name: /^Cart/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('bottom-nav-cart-badge')).not.toBeInTheDocument();
  });

  it('invokes the Home and Shop callbacks', async () => {
    const user = userEvent.setup();
    const { onHome, onShop } = renderNav();

    await user.click(screen.getByRole('button', { name: 'Home' }));
    await user.click(screen.getByRole('button', { name: 'Shop' }));

    expect(onHome).toHaveBeenCalledOnce();
    expect(onShop).toHaveBeenCalledOnce();
  });

  it('resets scroll when a route destination is activated', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    renderNav();

    await user.click(screen.getByRole('link', { name: 'Orders' }));
    await user.click(screen.getByRole('link', { name: 'Guides' }));
    await user.click(screen.getByRole('link', { name: 'Labs' }));
    await user.click(screen.getByRole('link', { name: 'Reviews' }));

    expect(scrollTo).toHaveBeenCalledTimes(4);
    expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 0, behavior: 'auto' });
    expect(scrollTo).toHaveBeenNthCalledWith(4, { top: 0, behavior: 'auto' });
    scrollTo.mockRestore();
  });

  // --- Active destination ---

  it('marks Home current on the landing view', () => {
    renderNav({ activeView: 'landing' });

    const current = currentItems();
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(screen.getByRole('button', { name: 'Home' }));
  });

  it('marks Shop current while the catalog is on screen', () => {
    renderNav({ activeView: 'menu' });

    const current = currentItems();
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(screen.getByRole('button', { name: 'Shop' }));
  });

  it.each(['cart', 'checkout', 'access'] as const)(
    'marks nothing current while the %s view is open',
    (activeView) => {
      renderNav({ activeView });

      expect(currentItems()).toHaveLength(0);
    },
  );

  it.each([
    ['the Lab Reports page', '/coa', 'Labs'],
    ['the order tracking page', '/track-order', 'Orders'],
    ['the protocol guide page', '/protocols', 'Guides'],
    ['the reviews page', '/reviews', 'Reviews'],
  ])('marks %s as the current destination', (_name, path, currentName) => {
    renderNav({ path });

    const current = currentItems();
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(screen.getByRole('link', { name: currentName }));
  });

  it.each(['landing', 'menu', 'cart'] as const)(
    'does not leak the %s storefront view onto the Lab Reports page',
    (activeView) => {
      renderNav({ path: '/coa', activeView });

      const current = currentItems();
      expect(current).toHaveLength(1);
      expect(current[0]).toBe(screen.getByRole('link', { name: 'Labs' }));
    },
  );

  it('marks nothing current on a public page with no bottom nav entry', () => {
    renderNav({ path: '/faq' });

    expect(currentItems()).toHaveLength(0);
  });

  // --- Feature visibility ---

  describe('feature visibility', () => {
    it('omits Lab Reports and keeps five columns when the setting is off', () => {
      renderNav({ showLabReports: false });

      expect(screen.queryByRole('link', { name: 'Labs' })).not.toBeInTheDocument();

      const nav = screen.getByRole('navigation', { name: 'Storefront' });
      expect(nav).toHaveClass('grid-cols-5');
      expect(nav).not.toHaveClass('grid-cols-6');
    });

    it('keeps the other destinations reachable on the Lab Reports page when the setting is off', () => {
      renderNav({ showLabReports: false, path: '/coa' });

      expect(screen.queryByRole('link', { name: 'Labs' })).not.toBeInTheDocument();
      expect(currentItems()).toHaveLength(0);
    });

    it('drops the Reviews tab when customer reviews are switched off', () => {
      renderNav({ showReviews: false });

      expect(screen.queryByRole('link', { name: 'Reviews' })).not.toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Storefront' })).toHaveClass('grid-cols-5');
    });

    it('keeps the other destinations reachable on the reviews page when the setting is off', () => {
      renderNav({ showReviews: false, path: '/reviews' });

      expect(screen.queryByRole('link', { name: 'Reviews' })).not.toBeInTheDocument();
      expect(currentItems()).toHaveLength(0);
    });

    it('drops the Orders tab when order tracking is switched off', () => {
      renderNav({ showOrders: false });

      expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Storefront' })).toHaveClass('grid-cols-5');
    });

    it('drops the Guides tab when protocols are switched off', () => {
      renderNav({ showGuides: false });

      expect(screen.queryByRole('link', { name: 'Guides' })).not.toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Storefront' })).toHaveClass('grid-cols-5');
    });

    it('keeps Home and Shop when every optional tab is off', () => {
      renderNav({
        showOrders: false,
        showGuides: false,
        showLabReports: false,
        showReviews: false,
      });

      expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Shop' })).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Storefront' })).toHaveClass('grid-cols-2');
    });

    it('narrows to three columns when a single optional tab remains', () => {
      renderNav({ showOrders: false, showGuides: false, showLabReports: false });

      expect(screen.getByRole('link', { name: 'Reviews' })).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Storefront' })).toHaveClass('grid-cols-3');
    });
  });
});
