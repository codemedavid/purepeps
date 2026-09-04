import { render, screen } from '@testing-library/react';
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
describe('PeptideCalculator — mobile navigation', () => {
  it('offers the burger drawer, the only route to FAQ and Reviews on a phone', () => {
    render(<PeptideCalculator />);

    expect(screen.getByRole('button', { name: 'Toggle menu' })).toBeInTheDocument();
  });

  it('keeps that burger to small screens, where the desktop bar is hidden', () => {
    render(<PeptideCalculator />);

    expect(screen.getByRole('button', { name: 'Toggle menu' })).toHaveClass('md:hidden');
  });

  it('keeps the header cart to desktop widths', () => {
    render(<PeptideCalculator />);

    expect(screen.getByRole('button', { name: 'View cart' })).toHaveClass('hidden', 'md:block');
  });
});
