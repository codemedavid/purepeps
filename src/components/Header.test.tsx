import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Header from './Header';

const renderHeader = (props: Partial<React.ComponentProps<typeof Header>> = {}) => {
  const defaults: React.ComponentProps<typeof Header> = {
    cartItemsCount: 2,
    onCartClick: vi.fn(),
    onMenuClick: vi.fn(),
    onGetAccess: vi.fn(),
    isVerified: false,
  };

  return render(<Header {...defaults} {...props} />);
};

describe('Header', () => {
  it('keeps the cart and mobile menu controls by default', async () => {
    const user = userEvent.setup();
    renderHeader();

    expect(screen.getByRole('button', { name: 'View cart' })).toBeInTheDocument();
    const toggleMenu = screen.getByRole('button', { name: 'Toggle menu' });
    expect(toggleMenu).toBeInTheDocument();

    await user.click(toggleMenu);

    expect(screen.getByText('Track Order')).toBeInTheDocument();
  });

  // The cart moved out of the bottom navigation and into the header, so it can
  // no longer be hidden on small screens: this is now the ONLY cart entry on a
  // phone, and hiding it would leave no way to reach the cart at all.
  it('shows the cart at every breakpoint', () => {
    renderHeader();

    const cartButton = screen.getByRole('button', { name: 'View cart' });
    expect(cartButton).not.toHaveClass('hidden');
    expect(cartButton.className).not.toContain('md:block');
  });

  it('places the cart immediately beside the burger menu', () => {
    renderHeader();

    const cartButton = screen.getByRole('button', { name: 'View cart' });
    const toggleMenu = screen.getByRole('button', { name: 'Toggle menu' });

    expect(cartButton.nextElementSibling).toBe(toggleMenu);
  });

  it('keeps the drawer closed until the burger is tapped', () => {
    renderHeader();

    // Track Order is asserted by its full label, which only the drawer renders
    // — the desktop bar shows the shortLabel "Track".
    expect(screen.queryByText('Track Order')).not.toBeInTheDocument();
  });

  it('shows the burger only on small screens', () => {
    renderHeader();

    // md:hidden is what makes it a small-device control; the desktop bar
    // already lists the same destinations.
    expect(screen.getByRole('button', { name: 'Toggle menu' })).toHaveClass('md:hidden');
  });

  it('opens the side nav from the burger', async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));

    expect(screen.getByText('Track Order')).toBeInTheDocument();
    expect(screen.getByText('Customer Reviews')).toBeInTheDocument();
  });
});

describe('Header — feature visibility', () => {
  it('shows every side-nav entry when all features are on', async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));

    for (const label of [
      'Products',
      'Calculator',
      'Protocols',
      'Track Order',
      'FAQ',
      'Lab Reports',
      'Customer Reviews',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('drops Customer Reviews from the side nav when the feature is off', () => {
    // Reviews are hidden, not deleted: get_approved_reviews still holds every
    // approved row, and switching the feature back restores them.
    renderHeader({ features: { reviews: false } });

    expect(screen.queryByText('Customer Reviews')).not.toBeInTheDocument();
  });

  it('drops a disabled feature from the side nav', async () => {
    const user = userEvent.setup();
    renderHeader({ features: { faq: false } });

    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));

    expect(screen.queryByText('FAQ')).not.toBeInTheDocument();
    expect(screen.getAllByText('Protocols').length).toBeGreaterThan(0);
  });

  it('drops a disabled feature from the desktop nav too', () => {
    renderHeader({ features: { lab_reports: false } });

    expect(screen.queryByText('Lab Reports')).not.toBeInTheDocument();
  });

  it('hides the Products entry without touching the cart', async () => {
    const user = userEvent.setup();
    renderHeader({ features: { products: false } });

    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));

    expect(screen.queryByText('Products')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View cart' })).toBeInTheDocument();
  });

  it('hides every entry when all seven features are off', async () => {
    const user = userEvent.setup();
    renderHeader({
      features: {
        products: false,
        calculator: false,
        protocols: false,
        track_order: false,
        faq: false,
        lab_reports: false,
        reviews: false,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));

    for (const label of [
      'Products',
      'Calculator',
      'Protocols',
      'Track Order',
      'FAQ',
      'Lab Reports',
      'Customer Reviews',
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    // The drawer itself still opens; only the feature entries are gone.
    expect(screen.getByRole('button', { name: 'View cart' })).toBeInTheDocument();
  });
});
