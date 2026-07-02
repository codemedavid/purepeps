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

  it('groups a repeat order under one reference with numbered sub-rows', () => {
    const root = { ...order('root', 'Juan Dela Cruz', 'confirmed'), order_number: 'PP-0001' };
    const repeat = {
      ...order('repeat', 'Juan Dela Cruz', 'new'),
      order_number: 'PP-0007',
      parent_order_id: 'root',
      created_at: '2026-06-02T08:00:00Z',
    };
    render(
      <BatchOrdersPanel
        batchNumber={7}
        orders={[repeat, root]}
        loading={false}
        busy={false}
        requestConfirm={vi.fn()}
        onReload={vi.fn()}
        onSelectOrder={vi.fn()}
        onBulkUpdateStatus={vi.fn()}
      />,
    );

    // One reference header + a per-order count badge for the group. PP-0001 shows
    // twice: as the group reference and as the root order's own number on Order 1.
    expect(screen.getAllByText('PP-0001')).toHaveLength(2);
    expect(screen.getByText('2 orders')).toBeInTheDocument();
    // Numbered sub-rows, each keeping its own real order number.
    expect(screen.getByText('Order 1')).toBeInTheDocument();
    expect(screen.getByText('Order 2')).toBeInTheDocument();
    expect(screen.getByText('PP-0007')).toBeInTheDocument();
  });

  it('opens the specific sub-order that was clicked', async () => {
    const onSelectOrder = vi.fn();
    const root = { ...order('root', 'Juan Dela Cruz'), order_number: 'PP-0001' };
    const repeat = {
      ...order('repeat', 'Juan Dela Cruz'),
      order_number: 'PP-0007',
      parent_order_id: 'root',
      created_at: '2026-06-02T08:00:00Z',
    };
    render(
      <BatchOrdersPanel
        batchNumber={7}
        orders={[repeat, root]}
        loading={false}
        busy={false}
        requestConfirm={vi.fn()}
        onReload={vi.fn()}
        onSelectOrder={onSelectOrder}
        onBulkUpdateStatus={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText('Order 2'));

    expect(onSelectOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 'repeat' }));
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
