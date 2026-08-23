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

  it('suppresses mobile storefront actions while retaining a desktop cart', () => {
    renderHeader({ hideMobileStorefrontActions: true });

    expect(screen.queryByRole('button', { name: 'Toggle menu' })).not.toBeInTheDocument();
    expect(screen.queryByText('Track Order')).not.toBeInTheDocument();

    const cartButton = screen.getByRole('button', { name: 'View cart' });
    expect(cartButton).toHaveClass('hidden', 'md:block');
  });
});

describe('Header — feature visibility', () => {
  it('shows every side-nav entry when all features are on', async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));

    for (const label of ['Products', 'Calculator', 'Protocols', 'Track Order', 'FAQ', 'Lab Reports']) {
      expect(screen.getByRole('link', { name: label }) ?? screen.getByText(label)).toBeTruthy();
    }
  });

  it('drops a disabled feature from the side nav', async () => {
    const user = userEvent.setup();
    renderHeader({ features: { faq: false } });

    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));

    expect(screen.queryByText('FAQ')).not.toBeInTheDocument();
    expect(screen.getByText('Protocols')).toBeInTheDocument();
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

  it('hides every entry when all six features are off', async () => {
    const user = userEvent.setup();
    renderHeader({
      features: {
        products: false,
        calculator: false,
        protocols: false,
        track_order: false,
        faq: false,
        lab_reports: false,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));

    for (const label of ['Products', 'Calculator', 'Protocols', 'Track Order', 'FAQ', 'Lab Reports']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    // The drawer itself still opens; only the feature entries are gone.
    expect(screen.getByRole('button', { name: 'View cart' })).toBeInTheDocument();
  });
});
