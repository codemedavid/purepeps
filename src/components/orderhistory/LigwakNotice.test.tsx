import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LigwakNotice from './LigwakNotice';
import type { OrderHistoryLigwak } from '../../types';

function ligwak(overrides: Partial<OrderHistoryLigwak> = {}): OrderHistoryLigwak {
  return {
    product_name: 'Retatrutide',
    variation_name: '10mg',
    quantity_mg: 10,
    total_quantity: 5,
    confirmed_quantity: 2,
    ligwak_quantity: 3,
    refund_amount: 3000,
    refund_status: 'refund_pending',
    refund_reference: null,
    refunded_at: null,
    ...overrides,
  };
}

describe('LigwakNotice', () => {
  it('renders nothing when the order was not affected', () => {
    const { container } = render(<LigwakNotice ligwak={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('names the situation in the customer s words', () => {
    render(<LigwakNotice ligwak={[ligwak()]} />);

    expect(screen.getByText(/Ligwak — Incomplete Kit/i)).toBeInTheDocument();
    expect(
      screen.getByText(/included in an incomplete kit when the Group Buy closed/i),
    ).toBeInTheDocument();
  });

  it('shows the affected product and quantity', () => {
    render(<LigwakNotice ligwak={[ligwak()]} />);

    expect(screen.getByText(/Retatrutide/)).toBeInTheDocument();
    expect(screen.getByText(/10mg/)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  // A partly fulfilled order must say so plainly, or the customer reads the
  // notice as "my whole order is cancelled".
  it('reassures the customer about the part that still ships', () => {
    render(<LigwakNotice ligwak={[ligwak({ confirmed_quantity: 2 })]} />);

    expect(screen.getByText(/still confirmed/i)).toBeInTheDocument();
  });

  it('omits the confirmed line when nothing on that item survived', () => {
    render(<LigwakNotice ligwak={[ligwak({ confirmed_quantity: 0, ligwak_quantity: 5 })]} />);

    expect(screen.queryByText(/still confirmed/i)).not.toBeInTheDocument();
  });

  it('shows the expected refund and where it stands', () => {
    render(<LigwakNotice ligwak={[ligwak()]} />);

    expect(screen.getByText(/3,000/)).toBeInTheDocument();
    expect(screen.getByText('Refund Pending')).toBeInTheDocument();
  });

  it('shows the reference number once the refund has one', () => {
    render(
      <LigwakNotice
        ligwak={[ligwak({ refund_status: 'refunded', refund_reference: 'GC-88213' })]}
      />,
    );

    expect(screen.getByText(/GC-88213/)).toBeInTheDocument();
  });

  it('hides the reference row while there is no reference yet', () => {
    render(<LigwakNotice ligwak={[ligwak({ refund_reference: null })]} />);

    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument();
  });

  it('says so plainly when no refund is due', () => {
    render(
      <LigwakNotice
        ligwak={[ligwak({ refund_amount: 0, refund_status: 'no_refund_required' })]}
      />,
    );

    expect(screen.getByText('No Refund Required')).toBeInTheDocument();
  });

  it('lists every affected item when more than one was ligwak', () => {
    render(
      <LigwakNotice
        ligwak={[ligwak(), ligwak({ product_name: 'Tirzepatide', variation_name: '15mg' })]}
      />,
    );

    expect(screen.getByText(/Retatrutide/)).toBeInTheDocument();
    expect(screen.getByText(/Tirzepatide/)).toBeInTheDocument();
  });
});
