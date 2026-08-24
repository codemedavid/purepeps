import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LigwakTable from './LigwakTable';
import type { LigwakRecord } from '../../types';

function record(overrides: Partial<LigwakRecord> = {}): LigwakRecord {
  return {
    id: 'rec-1',
    allocation_id: 'alloc-1',
    entry_id: 'entry-1',
    batch_id: 'batch-1',
    order_id: 'order-1',
    order_number: 'PP-1042',
    ordered_at: '2026-08-02T09:00:00Z',
    customer_name: 'Juan Dela Cruz',
    customer_email: 'juan@example.com',
    customer_phone: '09170000000',
    product_id: 'prod-1',
    product_name: 'Retatrutide',
    variation_id: 'var-1',
    variation_name: '10mg',
    quantity_mg: 10,
    total_quantity: 5,
    confirmed_quantity: 2,
    ligwak_quantity: 3,
    refund_amount: 3000,
    shipping_refunded: 0,
    payment_type: 'pay_now',
    payment_status: 'paid',
    payment_method_name: 'GCash',
    refund_status: 'for_review',
    refund_reference: null,
    refund_proof_url: null,
    refunded_at: null,
    reason: 'Included in the final incomplete kit.',
    admin_notes: null,
    customer_notified_at: null,
    batch_label: 'Batch 7',
    created_at: '2026-08-10T00:00:00Z',
    updated_at: '2026-08-10T00:00:00Z',
    ...overrides,
  };
}

describe('LigwakTable', () => {
  it('shows the customer, order and product identity of every row', () => {
    render(<LigwakTable records={[record()]} onOpenRefund={vi.fn()} />);

    const row = screen.getByRole('row', { name: /Juan Dela Cruz/ });
    for (const value of ['Juan Dela Cruz', 'juan@example.com', '09170000000', 'PP-1042',
                         'Batch 7', 'Retatrutide', '10mg']) {
      expect(within(row).getByText(new RegExp(value.replace('.', '\\.')))).toBeInTheDocument();
    }
  });

  it('separates total, confirmed and ligwak quantities', () => {
    render(<LigwakTable records={[record()]} onOpenRefund={vi.fn()} />);

    const row = screen.getByRole('row', { name: /Juan Dela Cruz/ });
    expect(within(row).getByTestId('total-qty')).toHaveTextContent('5');
    expect(within(row).getByTestId('confirmed-qty')).toHaveTextContent('2');
    expect(within(row).getByTestId('ligwak-qty')).toHaveTextContent('3');
  });

  it('shows the refund amount and status as human labels', () => {
    render(<LigwakTable records={[record()]} onOpenRefund={vi.fn()} />);

    expect(screen.getByText(/3,000/)).toBeInTheDocument();
    expect(screen.getByText('For Review')).toBeInTheDocument();
    expect(screen.getByText('Pay Now')).toBeInTheDocument();
  });

  it('opens the refund workflow for a record', async () => {
    const onOpenRefund = vi.fn();
    render(<LigwakTable records={[record()]} onOpenRefund={onOpenRefund} />);

    await userEvent.click(screen.getByRole('button', { name: /refund/i }));

    expect(onOpenRefund).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec-1' }));
  });

  it('tells the admin when a customer has already been notified', () => {
    render(
      <LigwakTable
        records={[record({ customer_notified_at: '2026-08-11T00:00:00Z' })]}
        onOpenRefund={vi.fn()}
      />,
    );

    expect(screen.getByTitle(/notified/i)).toBeInTheDocument();
  });

  it('shows an empty state rather than a bare table', () => {
    render(<LigwakTable records={[]} onOpenRefund={vi.fn()} />);

    expect(screen.getByText(/no ligwak/i)).toBeInTheDocument();
  });

  // A COD customer has already paid for their vials online, so their refund is
  // real. The table must never imply otherwise.
  it('shows a real refund owed to a COD customer', () => {
    render(
      <LigwakTable
        records={[record({ payment_type: 'cod', payment_status: 'pending', refund_amount: 3000 })]}
        onOpenRefund={vi.fn()}
      />,
    );

    expect(screen.getByText('Cash on Delivery')).toBeInTheDocument();
    expect(screen.getByText(/3,000/)).toBeInTheDocument();
    expect(screen.queryByText('No Refund Required')).not.toBeInTheDocument();
  });
});
