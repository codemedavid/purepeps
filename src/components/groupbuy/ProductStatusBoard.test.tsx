import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductStatusBoard } from './ProductStatusBoard';
import type { BatchOrder, GroupBuyProgressItem, OrderLineItem } from '../../types';

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

let seq = 0;
function order(overrides: Partial<BatchOrder> = {}): BatchOrder {
  seq += 1;
  return {
    id: `o${seq}`,
    order_number: `PP-${1000 + seq}`,
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
    payment_status: 'pending',
    order_status: 'new',
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

  it('shows the ordered quantity in kits with vials as subtext', () => {
    render(
      <ProductStatusBoard items={[progressItem({ total_quantity: 25, cap_quantity: 30 })]} phase="open" />,
    );
    expect(screen.getAllByText('2.5').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('25 vials').length).toBeGreaterThanOrEqual(1);
  });

  it('renders a per-variation breakdown when orders are supplied', () => {
    render(
      <ProductStatusBoard
        items={[progressItem({ total_quantity: 3, confirmed_quantity: 3 })]}
        phase="open"
        orders={[
          order({
            order_status: 'confirmed',
            order_items: [
              lineItem({ product_id: 'p1', variation_id: 'v1', variation_name: '5mg', quantity: 2 }),
            ],
          }),
          order({
            order_status: 'confirmed',
            order_items: [
              lineItem({ product_id: 'p1', variation_id: 'v2', variation_name: '10mg', quantity: 1 }),
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText('5mg')).toBeInTheDocument();
    expect(screen.getByText('10mg')).toBeInTheDocument();
    // Each variation was ordered once — "1 order" should appear per variation row.
    expect(screen.getAllByText('1 order')).toHaveLength(2);
  });

  it('omits the variation breakdown when no orders are supplied', () => {
    render(
      <ProductStatusBoard items={[progressItem({ total_quantity: 3, confirmed_quantity: 3 })]} phase="open" />,
    );
    expect(screen.queryByText('5mg')).not.toBeInTheDocument();
  });

  it('omits the sub-row for a product with only one variation (it would just duplicate the parent row)', () => {
    render(
      <ProductStatusBoard
        items={[progressItem({ total_quantity: 3, confirmed_quantity: 3 })]}
        phase="open"
        orders={[
          order({
            order_status: 'confirmed',
            order_items: [
              lineItem({ product_id: 'p1', variation_id: 'v1', variation_name: '5mg', quantity: 3 }),
            ],
          }),
        ]}
      />,
    );
    expect(screen.queryByText('5mg')).not.toBeInTheDocument();
    expect(screen.queryByText('Standard')).not.toBeInTheDocument();
  });
});
