import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import TrackerOrderSummary from './TrackerOrderSummary';
import type { OrderBundleRow } from '../../types';

function makeOrder(overrides: Partial<OrderBundleRow> = {}): OrderBundleRow {
  return {
    id: 'order-1',
    order_number: 'TBS-1234',
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
    ...overrides,
  };
}

describe('TrackerOrderSummary', () => {
  it('lists each product with its exact strength, quantity and unit price', () => {
    render(<TrackerOrderSummary order={makeOrder()} />);

    const items = screen.getByRole('table', { name: /tracked order items/i });
    expect(within(items).getByText('Tirzepatide')).toBeInTheDocument();
    expect(within(items).getByText(/Blend A · 10 mg/)).toBeInTheDocument();
    expect(within(items).getByText('2')).toBeInTheDocument();
    expect(within(items).getByText('₱2,500.00')).toBeInTheDocument();
    expect(within(items).getByText('₱5,000.00')).toBeInTheDocument();
  });

  it('prints the milligrams stored on the line, even when the variation name is not the strength', () => {
    render(
      <TrackerOrderSummary
        order={makeOrder({
          order_items: [
            {
              product_id: 'p1',
              product_name: 'Tirzepatide',
              variation_id: 'v1',
              variation_name: 'Blend A',
              quantity: 1,
              price: 2500,
              total: 2500,
              quantity_mg: 10,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText(/Blend A · 10 mg/)).toBeInTheDocument();
  });

  it('breaks down subtotal, discount, shipping and total', () => {
    render(
      <TrackerOrderSummary
        order={makeOrder({ total_price: 4500, discount_applied: 500, promo_code: 'SAVE500' })}
      />,
    );

    const charges = screen.getByRole('heading', { name: /^charges$/i }).parentElement as HTMLElement;
    expect(within(charges).getByText('₱5,000.00')).toBeInTheDocument();
    expect(within(charges).getByText('-₱500.00')).toBeInTheDocument();
    expect(within(charges).getByText('SAVE500')).toBeInTheDocument();
    expect(within(charges).getByText('₱200.00')).toBeInTheDocument();
    expect(within(charges).getByText('₱4,700.00')).toBeInTheDocument();
  });

  it('shows payment method, option and status', () => {
    render(<TrackerOrderSummary order={makeOrder()} />);

    expect(screen.getByText('GCash')).toBeInTheDocument();
    expect(screen.getByText('Pay Now')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('says the courier collects only the shipping fee on a COD order', () => {
    render(<TrackerOrderSummary order={makeOrder({ payment_type: 'cod', payment_status: 'pending' })} />);

    expect(screen.getByText(/Cash on Delivery/)).toBeInTheDocument();
    expect(screen.getByText(/courier collects/i)).toHaveTextContent('₱200.00');
  });

  it('shows when the order was placed and that it is in a group buy', () => {
    render(<TrackerOrderSummary order={makeOrder()} />);

    expect(screen.getByText('Ordered')).toBeInTheDocument();
    expect(screen.getByText(/This order is in a group buy/i)).toBeInTheDocument();
  });
});
