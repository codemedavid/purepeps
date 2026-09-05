import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import PeptideCalculator from './PeptideCalculator';

/**
 * Mobile navigation on this page comes from BOTH the bottom bar its route
 * wrapper renders (see `PublicNoticePage` in App.tsx) and the header's burger
 * drawer.
 *
 * An earlier revision removed the burger here to avoid "two competing
 * navigations". That reasoning does not survive the numbers: the bottom bar
 * caps at six columns — Home, Shop and Cart plus at most Lab Reports, Orders
 * and Guides — so it can never reach FAQ or Customer Reviews. Without the
 * burger those pages are simply unreachable from here on a phone. The two are
 * not duplicates: the bar is the shortcut, the drawer is the full index.
 */
// PeptideCalculator navigates with the router (its header cart opens the
// storefront cart), and the app always renders it inside one.
const renderCalculator = () => render(<PeptideCalculator />, { wrapper: MemoryRouter });

describe('PeptideCalculator — mobile navigation', () => {
  it('offers the burger drawer, the only route to FAQ and Reviews on a phone', () => {
    renderCalculator();

    expect(screen.getByRole('button', { name: 'Toggle menu' })).toBeInTheDocument();
  });

  it('keeps that burger to small screens, where the desktop bar is hidden', () => {
    renderCalculator();

    expect(screen.getByRole('button', { name: 'Toggle menu' })).toHaveClass('md:hidden');
  });

  // The cart moved into the header beside the burger and is no longer hidden
  // on phones: the bottom navigation carries Reviews now, so this is the only
  // cart entry on a small screen.
  it('shows the header cart at every width', () => {
    renderCalculator();

    const cart = screen.getByRole('button', { name: 'View cart' });
    expect(cart).not.toHaveClass('hidden');
    expect(cart.className).not.toContain('md:block');
  });
});
