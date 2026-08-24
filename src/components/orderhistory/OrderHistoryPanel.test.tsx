import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrderHistoryPanel from './OrderHistoryPanel';
import type { OrderHistoryRow } from '../../types';

function makeRow(overrides: Partial<OrderHistoryRow> = {}): OrderHistoryRow {
  return {
    id: 'order-1',
    order_number: 'TBS-000123',
    created_at: '2026-03-01T02:00:00Z',
    customer_name: 'Maria Santos',
    customer_email: 'maria@example.com',
    customer_phone: '09171234567',
    contact_method: 'viber',
    shipping_address: '12 Mabini St',
    shipping_barangay: 'Poblacion',
    shipping_city: 'Makati',
    shipping_state: 'Metro Manila',
    shipping_zip_code: '1200',
    shipping_country: 'Philippines',
    shipping_location: 'NCR',
    shipping_provider: null,
    shipping_note: null,
    tracking_number: null,
    selected_sticker_name: null,
    notes: null,
    group_buy_batch_id: 'batch-1',
    batch_name: 'March Run',
    batch_number: 7,
    batch_status: 'open',
    fulfillment_stage: null,
    order_items: [
      {
        product_id: 'p1',
        product_name: 'Tirzepatide',
        variation_id: 'v1',
        variation_name: 'Blend A',
        quantity: 2,
        price: 2500,
        total: 5000,
        quantity_mg: 10,
      },
    ],
    total_price: 5000,
    shipping_fee: 200,
    discount_applied: 0,
    promo_code: null,
    paid_total: null,
    balance_due: 0,
    refunded_total: null,
    payment_type: 'pay_now',
    payment_method_name: 'GCash',
    payment_status: 'pending',
    order_status: 'new',
    status_events: [],
    is_claim: false,
    parent_order_id: null,
    ...overrides,
  };
}

const second = makeRow({
  id: 'order-2',
  order_number: 'TBS-000456',
  customer_name: 'Jose Rizal',
  group_buy_batch_id: 'batch-2',
  batch_name: 'April Run',
  batch_number: 8,
  payment_status: 'paid',
  order_status: 'delivered',
  created_at: '2026-04-10T02:00:00Z',
  order_items: [
    {
      product_id: 'p2',
      product_name: 'Retatrutide',
      variation_id: null,
      variation_name: null,
      quantity: 1,
      price: 3000,
      total: 3000,
      quantity_mg: null,
    },
  ],
});

/** Expand the card for an order number so its detail is in the DOM. */
async function expand(user: ReturnType<typeof userEvent.setup>, orderNumber: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(orderNumber, 'i') }));
}

describe('OrderHistoryPanel', () => {
  it('tells the customer there is nothing yet when the history is empty', () => {
    render(<OrderHistoryPanel rows={[]} />);

    expect(screen.getByText(/no orders/i)).toBeInTheDocument();
  });

  it('lists one card per order with its number and group buy', () => {
    render(<OrderHistoryPanel rows={[makeRow(), second]} />);

    expect(screen.getByRole('button', { name: /TBS-000123/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /TBS-000456/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /TBS-000123/i })).toHaveTextContent('Batch 7');
  });

  it('keeps each order collapsed until it is opened', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow()]} />);

    const card = screen.getByRole('button', { name: /TBS-000123/i });
    expect(card).toHaveAttribute('aria-expanded', 'false');

    await expand(user, 'TBS-000123');

    expect(card).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the customer contact details once the order is opened', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow()]} />);

    await expand(user, 'TBS-000123');

    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    expect(screen.getByText('09171234567')).toBeInTheDocument();
  });

  it('shows the rest of what was entered at checkout', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow({ selected_sticker_name: 'Gold Foil' })]} />);

    await expand(user, 'TBS-000123');

    expect(screen.getByText(/12 Mabini St/)).toBeInTheDocument();
    expect(screen.getByText(/Poblacion/)).toBeInTheDocument();
    expect(screen.getByText('Gold Foil')).toBeInTheDocument();
  });

  it('lists each product with its exact strength, quantity and unit price', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow()]} />);

    await expand(user, 'TBS-000123');

    const items = screen.getByRole('table', { name: /items/i });
    expect(within(items).getByText('Tirzepatide')).toBeInTheDocument();
    expect(within(items).getByText(/Blend A · 10 mg/)).toBeInTheDocument();
    expect(within(items).getByText('2')).toBeInTheDocument();
    expect(within(items).getByText('₱2,500.00')).toBeInTheDocument();
  });

  it('breaks down subtotal, discount, shipping and total', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow({ total_price: 4500, discount_applied: 500, promo_code: 'SAVE500' })]} />);

    await expand(user, 'TBS-000123');

    expect(screen.getByText('₱5,000.00')).toBeInTheDocument();
    expect(screen.getByText('-₱500.00')).toBeInTheDocument();
    expect(screen.getByText('SAVE500')).toBeInTheDocument();
    expect(screen.getByText('₱200.00')).toBeInTheDocument();
    expect(screen.getByText('₱4,700.00')).toBeInTheDocument();
  });

  it('says the courier collects only the shipping fee on a COD order', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow({ payment_type: 'cod' })]} />);

    await expand(user, 'TBS-000123');

    expect(screen.getByText(/Cash on Delivery/)).toBeInTheDocument();
    expect(screen.getByText(/courier collects/i)).toHaveTextContent('₱200.00');
  });

  it('shows the payment method and payment status', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow({ payment_status: 'paid' })]} />);

    await expand(user, 'TBS-000123');

    expect(screen.getByText('GCash')).toBeInTheDocument();
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
  });

  it('shows the customer note when one was left', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow({ notes: 'Please leave with the guard' })]} />);

    await expand(user, 'TBS-000123');

    expect(screen.getByText('Please leave with the guard')).toBeInTheDocument();
  });

  it('renders the status timeline oldest first', async () => {
    const user = userEvent.setup();
    render(
      <OrderHistoryPanel
        rows={[
          makeRow({
            order_status: 'packing',
            status_events: [
              { event_type: 'placed', from_value: null, to_value: 'new', occurred_at: '2026-03-01T02:00:00Z' },
              { event_type: 'order_status', from_value: 'new', to_value: 'confirmed', occurred_at: '2026-03-02T02:00:00Z' },
              { event_type: 'order_status', from_value: 'confirmed', to_value: 'packing', occurred_at: '2026-03-03T02:00:00Z' },
            ],
          }),
        ]}
      />,
    );

    await expand(user, 'TBS-000123');

    const timeline = screen.getByRole('list', { name: /timeline/i });
    const labels = within(timeline).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(labels[0]).toContain('Order placed');
    expect(labels[1]).toContain('Confirmed');
    expect(labels[2]).toContain('Packing');
  });

  it('says so when an order predates the status log rather than implying nothing happened', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow({ order_status: 'delivered', payment_status: 'paid', status_events: [] })]} />);

    await expand(user, 'TBS-000123');

    expect(screen.getByText(/history starts here/i)).toBeInTheDocument();
  });

  it('narrows the list as the customer types a search', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow(), second]} />);

    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'Retatrutide');

    expect(screen.queryByRole('button', { name: /TBS-000123/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /TBS-000456/i })).toBeInTheDocument();
  });

  it('filters by order status', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow(), second]} />);

    await user.selectOptions(screen.getByLabelText(/order status/i), 'delivered');

    expect(screen.queryByRole('button', { name: /TBS-000123/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /TBS-000456/i })).toBeInTheDocument();
  });

  it('filters by payment status', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow(), second]} />);

    await user.selectOptions(screen.getByLabelText(/payment status/i), 'paid');

    expect(screen.queryByRole('button', { name: /TBS-000123/i })).not.toBeInTheDocument();
  });

  it('filters by group buy', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow(), second]} />);

    await user.selectOptions(screen.getByLabelText(/group buy/i), 'batch-2');

    expect(screen.queryByRole('button', { name: /TBS-000123/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /TBS-000456/i })).toBeInTheDocument();
  });

  it('filters by customer', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow(), second]} />);

    await user.selectOptions(screen.getByLabelText(/customer/i), 'Jose Rizal');

    expect(screen.queryByRole('button', { name: /TBS-000123/i })).not.toBeInTheDocument();
  });

  it('filters by order date range', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow(), second]} />);

    await user.type(screen.getByLabelText(/from/i), '2026-04-01');

    expect(screen.queryByRole('button', { name: /TBS-000123/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /TBS-000456/i })).toBeInTheDocument();
  });

  it('announces how many orders are showing', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow(), second]} />);

    await user.selectOptions(screen.getByLabelText(/order status/i), 'delivered');

    expect(screen.getByRole('status')).toHaveTextContent(/1 of 2/i);
  });

  it('restores the full list when the filters are cleared', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow(), second]} />);

    await user.selectOptions(screen.getByLabelText(/order status/i), 'delivered');
    await user.click(screen.getByRole('button', { name: /clear/i }));

    expect(screen.getByRole('button', { name: /TBS-000123/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /TBS-000456/i })).toBeInTheDocument();
  });

  it('explains an empty result instead of showing a blank panel', async () => {
    const user = userEvent.setup();
    render(<OrderHistoryPanel rows={[makeRow(), second]} />);

    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'zzzz');

    expect(screen.getByText(/no orders match/i)).toBeInTheDocument();
  });
});
