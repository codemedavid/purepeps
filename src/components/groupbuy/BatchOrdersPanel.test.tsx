import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchOrdersPanel } from './BatchOrdersPanel';
import type { BatchOrder } from '../../types';
import type { ConfirmRequest } from './ConfirmDialog';

function order(id: string, name: string, status = 'new'): BatchOrder {
  return {
    id,
    order_number: `PP-${id}`,
    customer_name: name,
    customer_email: `${name.split(' ')[0].toLowerCase()}@example.com`,
    customer_phone: '09170000000',
    contact_method: null,
    shipping_address: null,
    shipping_barangay: null,
    shipping_city: null,
    shipping_state: null,
    shipping_zip_code: null,
    shipping_country: null,
    shipping_location: null,
    order_items: [],
    subtotal: 0,
    total_price: 1000,
    shipping_fee: 0,
    payment_method_name: null,
    payment_proof_url: null,
    payment_status: 'pending',
    order_status: status,
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
  };
}

const orders = [
  order('1', 'Maria Santos', 'new'),
  order('2', 'Jose Rizal', 'confirmed'),
  order('3', 'Andres Bonifacio', 'confirmed'),
];

function setup() {
  const onSelectOrder = vi.fn();
  const onBulkUpdateStatus = vi.fn();
  let lastRequest: ConfirmRequest | null = null;
  const requestConfirm = vi.fn((req: ConfirmRequest) => {
    lastRequest = req;
  });
  render(
    <BatchOrdersPanel
      batchNumber={7}
      orders={orders}
      loading={false}
      busy={false}
      requestConfirm={requestConfirm}
      onReload={vi.fn()}
      onSelectOrder={onSelectOrder}
      onBulkUpdateStatus={onBulkUpdateStatus}
    />,
  );
  return { onSelectOrder, onBulkUpdateStatus, requestConfirm, getRequest: () => lastRequest };
}

describe('BatchOrdersPanel', () => {
  it('filters orders by the search box', async () => {
    setup();
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText('Jose Rizal')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox'), 'maria');

    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.queryByText('Jose Rizal')).not.toBeInTheDocument();
  });

  it('routes bulk apply through requestConfirm and fires the update on confirm', async () => {
    const { onBulkUpdateStatus, requestConfirm, getRequest } = setup();

    await userEvent.click(screen.getByRole('button', { name: /^Select/ }));
    await userEvent.click(screen.getByRole('button', { name: /Select all visible/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Apply/ }));

    expect(requestConfirm).toHaveBeenCalledTimes(1);
    expect(onBulkUpdateStatus).not.toHaveBeenCalled();

    getRequest()?.onConfirm();
    expect(onBulkUpdateStatus).toHaveBeenCalledWith(['1', '2', '3'], 'packing');
  });
});
