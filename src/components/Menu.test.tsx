import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Menu from './Menu';
import type { Category } from '../hooks/useCategories';

/**
 * Stable module-level fixtures. A stub that builds a fresh object literal on
 * every call hands the hook a new identity each render, which spins the
 * component instead of letting it settle.
 */
const CATEGORIES: Category[] = [
  {
    id: 'all',
    name: 'All Peptides',
    icon: 'Grid',
    sort_order: 0,
    active: true,
    is_free: false,
    created_at: '1970-01-01T00:00:00.000Z',
    updated_at: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-peptides',
    name: 'Peptides',
    icon: 'Flask',
    sort_order: 1,
    active: true,
    is_free: false,
    created_at: '1970-01-01T00:00:00.000Z',
    updated_at: '1970-01-01T00:00:00.000Z',
  },
];

const CATEGORIES_RESULT = { categories: CATEGORIES, loading: false, error: null };

vi.mock('../hooks/useCategories', () => ({
  useCategories: () => CATEGORIES_RESULT,
}));

const NOOP = () => {};

function renderMenu(props: Partial<React.ComponentProps<typeof Menu>> = {}) {
  return render(
    <Menu
      menuItems={[]}
      addToCart={NOOP}
      cartItems={[]}
      updateQuantity={NOOP}
      isVerified={false}
      onGetAccess={NOOP}
      {...props}
    />,
  );
}

/**
 * The client's report was "nawala po ata ung tier ko" — their tier vanished
 * from the storefront. `tierName` reaches this component from App (App.tsx
 * passes access.tierName) but nothing has ever rendered it, so a member who
 * paid for a tier is given no confirmation of which one they hold.
 */
describe('Menu — the member tier badge', () => {
  it('names the verified member tier on the catalog', () => {
    renderMenu({ isVerified: true, tierName: 'Peptides only' });

    expect(screen.getByText('Peptides only')).toBeInTheDocument();
  });

  it('labels the badge so the name is not mistaken for a product', () => {
    renderMenu({ isVerified: true, tierName: 'All Access ( peptides,skin boosters)' });

    const badge = screen.getByTestId('member-tier-badge');
    expect(badge).toHaveTextContent(/your tier/i);
    expect(badge).toHaveTextContent('All Access ( peptides,skin boosters)');
  });

  it('shows no tier badge to a shopper who has not paid for access', () => {
    renderMenu({ isVerified: false, tierName: null });

    expect(screen.queryByTestId('member-tier-badge')).not.toBeInTheDocument();
  });

  it('keeps the badge off when access is verified but no tier came back', () => {
    // Rather than printing an empty chip while the grant is still resolving.
    renderMenu({ isVerified: true, tierName: null });

    expect(screen.queryByTestId('member-tier-badge')).not.toBeInTheDocument();
  });

  it('replaces the get-access bar rather than stacking on top of it', () => {
    renderMenu({ isVerified: true, tierName: 'Peptides only' });

    expect(screen.queryByText('Free items are open to all')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-tier-badge')).toBeInTheDocument();
  });
});
