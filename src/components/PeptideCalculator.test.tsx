import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PeptideCalculator from './PeptideCalculator';

/**
 * Mobile navigation on this page belongs to the bottom bar that its route
 * wrapper renders (see `PublicNoticePage` in App.tsx). The header must not add
 * a second one, or a phone gets two competing navigations on one screen.
 */
describe('PeptideCalculator — mobile navigation', () => {
  it('leaves mobile navigation to the bottom bar instead of a burger drawer', () => {
    render(<PeptideCalculator />);

    expect(screen.queryByRole('button', { name: 'Toggle menu' })).not.toBeInTheDocument();
  });

  it('keeps the header cart to desktop widths', () => {
    render(<PeptideCalculator />);

    expect(screen.getByRole('button', { name: 'View cart' })).toHaveClass('hidden', 'md:block');
  });
});
