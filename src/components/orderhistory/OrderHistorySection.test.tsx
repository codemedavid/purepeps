import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrderHistorySection from './OrderHistorySection';

const mockRpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

const row = {
  id: 'order-1',
  order_number: 'TBS-000123',
  created_at: '2026-03-01T02:00:00Z',
  customer_name: 'Maria Santos',
  customer_email: 'maria@example.com',
  customer_phone: '09171234567',
  contact_method: null,
  shipping_address: '12 Mabini St',
  shipping_barangay: null,
  shipping_city: 'Makati',
  shipping_state: null,
  shipping_zip_code: null,
  shipping_country: null,
  shipping_location: null,
  shipping_provider: null,
  shipping_note: null,
  tracking_number: null,
  selected_sticker_name: null,
  notes: null,
  group_buy_batch_id: null,
  batch_name: null,
  batch_number: null,
  batch_status: null,
  fulfillment_stage: null,
  order_items: [],
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
};

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: [row], error: null });
});

describe('OrderHistorySection', () => {
  it('loads the history straight away when the lookup already proved an email', async () => {
    render(<OrderHistorySection verifiedEmail="maria@example.com" orderNumber={null} />);

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('get_order_history_by_email', {
        p_email: 'maria@example.com',
      }),
    );
    expect(await screen.findByRole('button', { name: /TBS-000123/i })).toBeInTheDocument();
  });

  it('asks for the email before showing personal details on an order-number lookup', () => {
    // An order number alone is guessable, so it does not unlock an address.
    render(<OrderHistorySection verifiedEmail={null} orderNumber="TBS-000123" />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('unlocks the history once the matching email is supplied', async () => {
    const user = userEvent.setup();
    render(<OrderHistorySection verifiedEmail={null} orderNumber="TBS-000123" />);

    await user.type(screen.getByLabelText(/email/i), 'maria@example.com');
    await user.click(screen.getByRole('button', { name: /view full order history/i }));

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('get_order_history_by_number', {
        p_order_number: 'TBS-000123',
        p_email: 'maria@example.com',
      }),
    );
  });

  it('says the pair did not match rather than leaving a blank panel', async () => {
    const user = userEvent.setup();
    mockRpc.mockResolvedValue({ data: [], error: null });
    render(<OrderHistorySection verifiedEmail={null} orderNumber="TBS-000123" />);

    await user.type(screen.getByLabelText(/email/i), 'wrong@example.com');
    await user.click(screen.getByRole('button', { name: /view full order history/i }));

    expect(await screen.findByText(/could not match/i)).toBeInTheDocument();
  });

  it('surfaces a lookup failure to the customer', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network is down' } });
    render(<OrderHistorySection verifiedEmail="maria@example.com" orderNumber={null} />);

    expect(await screen.findByText(/network is down/i)).toBeInTheDocument();
  });

  it('renders nothing at all before any lookup has happened', () => {
    const { container } = render(<OrderHistorySection verifiedEmail={null} orderNumber={null} />);

    expect(container).toBeEmptyDOMElement();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
