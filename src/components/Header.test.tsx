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
