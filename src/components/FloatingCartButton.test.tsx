import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FloatingCartButton from './FloatingCartButton';

describe('FloatingCartButton', () => {
  it('renders nothing when the cart is empty', () => {
    render(<FloatingCartButton itemCount={0} onCartClick={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'View cart' })).not.toBeInTheDocument();
  });

  it('is available from medium screens upward and opens the cart', async () => {
    const user = userEvent.setup();
    const onCartClick = vi.fn();
    render(<FloatingCartButton itemCount={3} onCartClick={onCartClick} />);

    const button = screen.getByRole('button', { name: 'View cart' });
    expect(button).toHaveClass('hidden', 'md:block');
    expect(screen.getByText('3 items in cart')).toBeInTheDocument();

    await user.click(button);

    expect(onCartClick).toHaveBeenCalledOnce();
  });
});
