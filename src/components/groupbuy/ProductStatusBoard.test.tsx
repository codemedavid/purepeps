import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductStatusBoard } from './ProductStatusBoard';
import type { GroupBuyProgressItem } from '../../types';

function progressItem(overrides: Partial<GroupBuyProgressItem> = {}): GroupBuyProgressItem {
  return {
    product_id: 'p1',
    product_name: 'BPC-157 5mg',
    total_quantity: 0,
    confirmed_quantity: 0,
    order_count: 0,
    cancelled_quantity: 0,
    cap_quantity: null,
    ...overrides,
  };
}

describe('ProductStatusBoard', () => {
  it('renders nothing when no product has demand or a cap', () => {
    const { container } = render(<ProductStatusBoard items={[]} phase="open" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the "Left" headline and cap headroom while open', () => {
    render(
      <ProductStatusBoard
        items={[progressItem({ total_quantity: 18, confirmed_quantity: 12, cap_quantity: 20 })]}
        phase="open"
      />,
    );
    expect(screen.getByText('Product status board')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Left' })).toBeInTheDocument();
    // Cap headroom 20 − 18 = 2 shows on the row and again in the footer total.
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the "To take over" headline with freed units while finalizing', () => {
    render(
      <ProductStatusBoard
        items={[
          progressItem({
            total_quantity: 17,
            confirmed_quantity: 17,
            cancelled_quantity: 3,
            cap_quantity: 20,
          }),
        ]}
        phase="finalizing"
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'To take over' })).toBeInTheDocument();
    expect(screen.getByText(/3 freed/)).toBeInTheDocument();
  });

  it('marks a capped product full and over cap', () => {
    render(
      <ProductStatusBoard
        items={[progressItem({ total_quantity: 25, cap_quantity: 20 })]}
        phase="open"
      />,
    );
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('over')).toBeInTheDocument();
  });
});
