import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Waybill } from './Waybill';
import { buildWaybillData, type WaybillOrderInput } from '../../utils/waybill';

function order(overrides: Partial<WaybillOrderInput> = {}): WaybillOrderInput {
  return {
    id: 'a1b2c3d4e5f6',
    order_number: 'PP-0001',
    customer_name: 'Jastine Moya',
    customer_phone: '9356174116',
    shipping_address: 'KAIA Homes, Phase 2',
    shipping_barangay: 'palangue 2',
    shipping_city: 'Naic',
    shipping_state: 'Cavite',
    shipping_zip_code: '4110',
    shipping_fee: 100,
    shipping_provider: 'J&T Luzon',
    order_items: [
      { product_name: 'AOD-9604', variation_name: '5mg', price: 510.45, quantity: 4, total: 2041.8 },
    ],
    payment_method_name: 'GCash',
    payment_status: 'paid',
    order_status: 'confirmed',
    created_at: '2026-07-01T09:30:00Z',
    ...overrides,
  };
}

describe('Waybill', () => {
  it('renders the customer, address, and item details', () => {
    render(<Waybill data={buildWaybillData(order(), { adminFee: 150 })} />);

    expect(screen.getByText('Jastine Moya')).toBeInTheDocument();
    expect(screen.getByText('9356174116')).toBeInTheDocument();
    expect(screen.getByText('Naic')).toBeInTheDocument();
    expect(screen.getByText('palangue 2')).toBeInTheDocument();
    expect(screen.getByText('AOD-9604 — 5mg')).toBeInTheDocument();
  });

  it('shows the fee breakdown with grand total', () => {
    render(<Waybill data={buildWaybillData(order(), { adminFee: 150 })} />);

    // items 2041.80 + admin 150 + shipping 100 = 2291.80
    expect(screen.getByText('₱2,291.80')).toBeInTheDocument();
    // "Admin fee" appears as both a left-column block and a totals row.
    expect(screen.getAllByText('Admin fee').length).toBeGreaterThanOrEqual(1);
  });

  it('marks a paid order as payment confirmed', () => {
    render(<Waybill data={buildWaybillData(order({ payment_status: 'paid' }))} />);
    expect(screen.getByText(/☑ Paid/)).toBeInTheDocument();
  });

  it('renders N/A for a missing courier instead of inventing data', () => {
    render(<Waybill data={buildWaybillData(order({ shipping_provider: null }))} />);
    const courierField = screen.getByText('Courier:').closest('p');
    expect(courierField).not.toBeNull();
    expect(within(courierField as HTMLElement).getByText('N/A')).toBeInTheDocument();
  });
});
