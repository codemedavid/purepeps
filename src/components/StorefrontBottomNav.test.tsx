import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import StorefrontBottomNav, {
  type MenuDestination,
  type StorefrontView,
} from './StorefrontBottomNav';

const renderNav = ({
  activeView = 'menu',
  menuDestination = 'home',
  cartItemCount = 0,
  showLabReports = true,
  showOrders = true,
  showGuides = true,
  path = '/',
  onHome = vi.fn(),
  onShop = vi.fn(),
  onCart = vi.fn(),
}: Partial<{
  activeView: StorefrontView;
  menuDestination: MenuDestination;
  cartItemCount: number;
  showLabReports: boolean;
  showOrders: boolean;
  showGuides: boolean;
  path: string;
  onHome: () => void;
  onShop: () => void;
  onCart: () => void;
}> = {}) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <StorefrontBottomNav
        activeView={activeView}
        menuDestination={menuDestination}
        cartItemCount={cartItemCount}
        showLabReports={showLabReports}
        showOrders={showOrders}
        showGuides={showGuides}
        onHome={onHome}
        onShop={onShop}
        onCart={onCart}
      />
    </MemoryRouter>,
  );

  return { onHome, onShop, onCart };
};

const currentItems = () =>
  screen.getByRole('navigation', { name: 'Storefront' }).querySelectorAll('[aria-current="page"]');

describe('StorefrontBottomNav', () => {
  it('renders six destinations in a mobile-only storefront nav', () => {
    renderNav();

    const nav = screen.getByRole('navigation', { name: 'Storefront' });
    expect(nav).toHaveClass('md:hidden', 'fixed', 'grid-cols-6');
    expect(nav.className).toContain('env(safe-area-inset-bottom)');
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shop' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/track-order');
    expect(screen.getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/protocols');
    expect(screen.getByRole('link', { name: 'Labs' })).toHaveAttribute('href', '/coa');
    expect(screen.getByRole('button', { name: 'Cart, 0 items' })).toBeInTheDocument();
  });

  it('invokes the Home, Shop, and Cart callbacks', async () => {
    const user = userEvent.setup();
    const { onHome, onShop, onCart } = renderNav({ cartItemCount: 2 });

    await user.click(screen.getByRole('button', { name: 'Home' }));
    await user.click(screen.getByRole('button', { name: 'Shop' }));
    await user.click(screen.getByRole('button', { name: 'Cart, 2 items' }));

    expect(onHome).toHaveBeenCalledOnce();
    expect(onShop).toHaveBeenCalledOnce();
    expect(onCart).toHaveBeenCalledOnce();
  });

  it('uses the refined level treatment for Cart and a slim indicator for the current item', () => {
    renderNav({ activeView: 'cart', cartItemCount: 2 });

    const cart = screen.getByRole('button', { name: 'Cart, 2 items' });

    expect(cart).toHaveClass('w-full', 'py-2', 'text-sakura-primary');
    expect(cart.className).toContain('before:h-0.5');
    expect(cart).not.toHaveClass('-mt-5', 'rounded-full', 'bg-sakura-primary', 'text-white');
  });

  it('resets scroll when a route destination is activated', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    renderNav();

    await user.click(screen.getByRole('link', { name: 'Orders' }));
    await user.click(screen.getByRole('link', { name: 'Guides' }));
    await user.click(screen.getByRole('link', { name: 'Labs' }));

    expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 0, behavior: 'auto' });
    expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 0, behavior: 'auto' });
    expect(scrollTo).toHaveBeenNthCalledWith(3, { top: 0, behavior: 'auto' });
    scrollTo.mockRestore();
  });

  // --- Lab Reports visibility ---

  describe('Lab Reports visibility', () => {
    it('omits Lab Reports and keeps five columns when the setting is off', () => {
      renderNav({ showLabReports: false });

      expect(screen.queryByRole('link', { name: 'Labs' })).not.toBeInTheDocument();

      const nav = screen.getByRole('navigation', { name: 'Storefront' });
      expect(nav).toHaveClass('grid-cols-5');
      expect(nav).not.toHaveClass('grid-cols-6');
      expect(screen.getByRole('link', { name: 'Orders' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Guides' })).toBeInTheDocument();
    });

    it('keeps the other destinations reachable on the Lab Reports page when the setting is off', () => {
      // A shopper with the page URL open while an admin turns the toggle off
      // still gets a working bar — just without the Lab Reports entry.
      renderNav({ showLabReports: false, path: '/coa' });

      expect(screen.queryByRole('link', { name: 'Labs' })).not.toBeInTheDocument();
      expect(currentItems()).toHaveLength(0);
    });
  });

  // --- Active destination ---

  it.each([
    ['menu/home', 'menu', 'home', 'Home'],
    ['menu/shop', 'menu', 'shop', 'Shop'],
    ['cart', 'cart', 'home', 'Cart, 0 items'],
    ['checkout', 'checkout', 'home', 'Cart, 0 items'],
  ] as const)('marks %s as the current destination', (_name, activeView, menuDestination, currentName) => {
    renderNav({ activeView, menuDestination });

    const expectedCurrent = screen.getByRole('button', { name: currentName });
    const current = currentItems();

    expect(current).toHaveLength(1);
    expect(current[0]).toBe(expectedCurrent);
  });

  it.each([
    ['the Lab Reports page', '/coa', 'Labs'],
    ['the order tracking page', '/track-order', 'Orders'],
    ['the protocol guide page', '/protocols', 'Guides'],
  ])('marks %s as the current destination', (_name, path, currentName) => {
    renderNav({ path });

    const expectedCurrent = screen.getByRole('link', { name: currentName });
    const current = currentItems();

    expect(current).toHaveLength(1);
    expect(current[0]).toBe(expectedCurrent);
  });

  it.each([
    ['menu/home', 'menu', 'home'],
    ['menu/shop', 'menu', 'shop'],
    ['cart', 'cart', 'home'],
  ] as const)(
    'does not leak the %s storefront view onto the Lab Reports page',
    (_name, activeView, menuDestination) => {
      renderNav({ path: '/coa', activeView, menuDestination });

      const current = currentItems();

      expect(current).toHaveLength(1);
      expect(current[0]).toBe(screen.getByRole('link', { name: 'Labs' }));
    },
  );

  it('marks nothing current on a public page with no bottom nav entry', () => {
    renderNav({ path: '/faq' });

    expect(currentItems()).toHaveLength(0);
  });

  it('does not mark menu destinations current when the access view is active', () => {
    renderNav({ activeView: 'access' });

    expect(currentItems()).toHaveLength(0);
  });

  // --- Cart badge ---

  it('hides the cart badge when there are no items', () => {
    renderNav({ cartItemCount: 0 });

    expect(screen.queryByTestId('bottom-nav-cart-badge')).not.toBeInTheDocument();
  });

  it.each([
    [1, '1', 'Cart, 1 item'],
    [3, '3', 'Cart, 3 items'],
    [99, '99', 'Cart, 99 items'],
    [100, '99+', 'Cart, 100 items'],
  ])('shows a cart badge and accessible item count for %i item(s)', (count, badge, accessibleName) => {
    renderNav({ cartItemCount: count });

    expect(screen.getByTestId('bottom-nav-cart-badge')).toHaveTextContent(badge);
    expect(screen.getByRole('button', { name: accessibleName })).toBeInTheDocument();
  });
});

describe('StorefrontBottomNav — feature visibility', () => {
  it('drops the Orders tab when order tracking is switched off', () => {
    renderNav({ showOrders: false });

    expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Guides' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Storefront' })).toHaveClass('grid-cols-5');
  });

  it('drops the Guides tab when protocols are switched off', () => {
    renderNav({ showGuides: false });

    expect(screen.queryByRole('link', { name: 'Guides' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Storefront' })).toHaveClass('grid-cols-5');
  });

  it('keeps Home, Shop and Cart when every optional tab is off', () => {
    renderNav({ showOrders: false, showGuides: false, showLabReports: false });

    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cart/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Storefront' })).toHaveClass('grid-cols-3');
  });

  it('narrows to four columns when a single optional tab remains', () => {
    renderNav({ showOrders: false, showGuides: false });

    expect(screen.getByRole('navigation', { name: 'Storefront' })).toHaveClass('grid-cols-4');
  });
});
