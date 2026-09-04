import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackedOrderRecord from './TrackedOrderRecord';
import type { OrderBundleRow, OrderHistoryRow } from '../../types';

const mockRpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

const fallback: OrderBundleRow = {
  id: 'order-1',
  order_number: 'TBS-000123',
  order_status: 'confirmed',
  payment_status: 'paid',
  payment_method_name: 'GCash',
  tracking_number: null,
  shipping_provider: null,
  shipping_note: null,
  total_price: 5000,
  shipping_fee: 200,
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
  created_at: '2026-03-01T02:00:00Z',
  promo_code: null,
  discount_applied: 0,
  fulfillment_stage: null,
  is_claim: false,
  parent_order_id: null,
  group_buy_batch_id: 'batch-1',
  batch_status: 'open',
  paid_total: 5000,
  payment_type: 'pay_now',
  refunded_total: null,
  manually_confirmed_at: null,
  balance_due: 0,
};

const historyRow: OrderHistoryRow = {
  ...fallback,
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
  selected_sticker_name: 'Gold Foil',
  notes: 'Please leave with the guard',
  batch_name: 'March Run',
  batch_number: 7,
  status_events: [
    {
      event_type: 'placed',
      from_value: null,
      to_value: 'new',
      occurred_at: '2026-03-01T02:00:00Z',
    },
  ],
};

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: [historyRow], error: null });
});

describe('TrackedOrderRecord', () => {
  it('asks for the email before showing personal details on an order-number lookup', () => {
    render(
      <TrackedOrderRecord
        verifiedEmail={null}
        orderNumber="TBS-000123"
        selectedOrderId="order-1"
        fallbackOrder={fallback}
      />,
    );

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByText('Maria Santos')).not.toBeInTheDocument();
    expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('renders the full history sheet once the matching email is supplied', async () => {
    const user = userEvent.setup();
    render(
      <TrackedOrderRecord
        verifiedEmail={null}
        orderNumber="TBS-000123"
        selectedOrderId="order-1"
        fallbackOrder={fallback}
      />,
    );

    await user.type(screen.getByLabelText(/email/i), 'maria@example.com');
    await user.click(screen.getByRole('button', { name: /show full order details/i }));

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('get_order_history_by_number', {
        p_order_number: 'TBS-000123',
        p_email: 'maria@example.com',
      }),
    );

    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText('09171234567')).toBeInTheDocument();
    expect(screen.getByText(/12 Mabini St/)).toBeInTheDocument();
    expect(screen.getByText('Gold Foil')).toBeInTheDocument();
    expect(screen.getByText('Please leave with the guard')).toBeInTheDocument();
    expect(screen.getByText(/Batch 7/)).toBeInTheDocument();
    expect(screen.getByText('Order placed')).toBeInTheDocument();

    const items = screen.getByRole('table', { name: /items ordered/i });
    expect(within(items).getByText(/Blend A · 10 mg/)).toBeInTheDocument();
  });

  it('loads the full record straight away when the lookup already proved an email', async () => {
    render(
      <TrackedOrderRecord
        verifiedEmail="maria@example.com"
        orderNumber="TBS-000123"
        selectedOrderId="order-1"
        fallbackOrder={fallback}
      />,
    );

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('get_order_history_by_email', {
        p_email: 'maria@example.com',
      }),
    );
    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });
});
