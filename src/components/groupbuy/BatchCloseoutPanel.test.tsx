import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchCloseoutPanel } from './BatchCloseoutPanel';
import type { ItemRevenueSummary } from '../../utils/groupBuyOverview';
import type { BatchOrder, OrderLineItem } from '../../types';

function summary(overrides: Partial<ItemRevenueSummary> = {}): ItemRevenueSummary {
  return {
    rows: [
      {
        product_id: 'p1',
        product_name: 'BPC-157 5mg',
        orderCount: 2,
        unitsOrdered: 3,
        unitsConfirmed: 2,
        unitsPending: 1,
        grossRevenue: 3000,
        collectedRevenue: 2000,
      },
    ],
    totalUnitsOrdered: 3,
    totalUnitsConfirmed: 2,
    totalUnitsPending: 1,
    totalGrossRevenue: 3000,
    totalCollectedRevenue: 2000,
    ...overrides,
  };
}

function lineItem(overrides: Partial<OrderLineItem> = {}): OrderLineItem {
  return {
    product_id: 'p1',
    product_name: 'BPC-157 5mg',
    variation_id: null,
    variation_name: null,
    quantity: 1,
    price: 1000,
    total: 1000,
    ...overrides,
  };
}

function order(overrides: Partial<BatchOrder> = {}): BatchOrder {
  return {
    id: 'order-1',
    order_number: 'PP-1001',
    customer_name: 'Jane Dela Cruz',
    customer_email: 'jane@example.com',
    customer_phone: '09170000000',
    contact_method: null,
    shipping_address: null,
    shipping_barangay: null,
    shipping_city: null,
    shipping_state: null,
    shipping_zip_code: null,
    shipping_country: null,
    shipping_location: null,
    order_items: [lineItem()],
    subtotal: 1000,
    total_price: 1000,
    shipping_fee: 0,
    payment_method_name: 'GCash',
    payment_proof_url: null,
    payment_status: 'paid',
    order_status: 'confirmed',
    admin_notes: null,
    notes: null,
    tracking_number: null,
    shipping_provider: null,
    shipping_note: null,
    group_buy_batch_id: 'b1',
    parent_order_id: null,
    is_claim: false,
    created_at: '2026-06-01T08:00:00Z',
    updated_at: '2026-06-01T08:00:00Z',
    ...overrides,
  };
}

describe('BatchCloseoutPanel', () => {
  it('renders nothing when there are no item rows', () => {
    const { container } = render(
      <BatchCloseoutPanel summary={summary({ rows: [] })} orders={[]} fulfillmentStage={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows per-item units and gross vs collected revenue', () => {
    render(<BatchCloseoutPanel summary={summary()} orders={[order()]} fulfillmentStage={null} />);
    expect(screen.getByText('Group buy closeout')).toBeInTheDocument();
    expect(screen.getByText('BPC-157 5mg')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Gross' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Collected' })).toBeInTheDocument();
    // Collected ₱2,000 in hand vs gross ₱3,000 expected (each shown on row + footer).
    expect(screen.getAllByText('₱2,000.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('₱3,000.00').length).toBeGreaterThanOrEqual(1);
  });

  it('summarizes shipping readiness from order statuses', () => {
    render(
      <BatchCloseoutPanel
        summary={summary()}
        orders={[
          order({ id: 'a', order_status: 'confirmed' }),
          order({ id: 'b', order_status: 'new' }),
          order({ id: 'c', order_status: 'cancelled' }),
        ]}
        fulfillmentStage="in_logistics"
      />,
    );
    expect(screen.getByText('In logistics')).toBeInTheDocument();
    expect(screen.getByText('1 awaiting confirmation')).toBeInTheDocument();
    expect(screen.getByText('1 cancelled')).toBeInTheDocument();
  });

  it('copies the closeout CSV to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    // Override after setup() — userEvent installs its own clipboard stub on setup.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<BatchCloseoutPanel summary={summary()} orders={[order()]} fulfillmentStage={null} />);
    await user.click(screen.getByRole('button', { name: /copy csv/i }));

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('Product,Orders,Units ordered');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
});
