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
  onHome = vi.fn(),
  onShop = vi.fn(),
  onCart = vi.fn(),
}: Partial<{
  activeView: StorefrontView;
  menuDestination: MenuDestination;
  cartItemCount: number;
  onHome: () => void;
  onShop: () => void;
  onCart: () => void;
}> = {}) => {
  render(
    <MemoryRouter>
      <StorefrontBottomNav
        activeView={activeView}
        menuDestination={menuDestination}
        cartItemCount={cartItemCount}
        onHome={onHome}
        onShop={onShop}
        onCart={onCart}
      />
    </MemoryRouter>,
  );

  return { onHome, onShop, onCart };
};

describe('StorefrontBottomNav', () => {
  it('renders five destinations in a mobile-only storefront nav', () => {
    renderNav();

    const nav = screen.getByRole('navigation', { name: 'Storefront' });
    expect(nav).toHaveClass('md:hidden', 'fixed', 'grid-cols-5');
    expect(nav.className).toContain('env(safe-area-inset-bottom)');
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shop' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/track-order');
    expect(screen.getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/protocols');
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

  it('resets scroll when Orders or Guides is activated', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    renderNav();

    await user.click(screen.getByRole('link', { name: 'Orders' }));
    await user.click(screen.getByRole('link', { name: 'Guides' }));

    expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 0, behavior: 'auto' });
    expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 0, behavior: 'auto' });
    scrollTo.mockRestore();
  });

  it.each([
    ['menu/home', 'menu', 'home', 'Home'],
    ['menu/shop', 'menu', 'shop', 'Shop'],
    ['cart', 'cart', 'home', 'Cart, 0 items'],
    ['checkout', 'checkout', 'home', 'Cart, 0 items'],
  ] as const)('marks %s as the current destination', (_name, activeView, menuDestination, currentName) => {
    renderNav({ activeView, menuDestination });

    const nav = screen.getByRole('navigation', { name: 'Storefront' });
    const expectedCurrent = screen.getByRole('button', { name: currentName });
    const currentItems = nav.querySelectorAll('[aria-current="page"]');

    expect(currentItems).toHaveLength(1);
    expect(currentItems[0]).toBe(expectedCurrent);
  });

  it('does not mark menu destinations current when the access view is active', () => {
    renderNav({ activeView: 'access' });

    const nav = screen.getByRole('navigation', { name: 'Storefront' });
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

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
