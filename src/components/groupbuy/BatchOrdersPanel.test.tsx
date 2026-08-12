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
  it('keeps batch printing visible but disabled until an order is confirmed', () => {
    render(
      <BatchOrdersPanel
        batchNumber={7}
        orders={[order('new', 'Maria Santos'), order('cancelled', 'Jose Rizal', 'cancelled')]}
        loading={false}
        busy={false}
        requestConfirm={vi.fn()}
        onReload={vi.fn()}
        onSelectOrder={vi.fn()}
        onBulkUpdateStatus={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Print waybills (0)' })).toBeDisabled();
    expect(screen.getByText('Confirmed orders are required before printing.')).toBeInTheDocument();
  });

  it('counts one printable customer for every eligible order status', () => {
    render(
      <BatchOrdersPanel
        batchNumber={7}
        orders={[
          order('new', 'New Customer'),
          order('confirmed', 'Confirmed Customer', 'confirmed'),
          order('packing', 'Packing Customer', 'packing'),
          order('delivery', 'Delivery Customer', 'out_for_delivery'),
          order('delivered', 'Delivered Customer', 'delivered'),
          order('cancelled', 'Cancelled Customer', 'cancelled'),
        ]}
        loading={false}
        busy={false}
        requestConfirm={vi.fn()}
        onReload={vi.fn()}
        onSelectOrder={vi.fn()}
        onBulkUpdateStatus={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Print waybills (4)' })).toBeEnabled();
  });

  it('consolidates a customer’s repeat order and claim add-on into one waybill', () => {
    const root = order('root', 'Maria Santos', 'confirmed');
    const repeat = {
      ...order('repeat', 'Maria Santos', 'packing'),
      parent_order_id: root.id,
      created_at: '2026-06-02T08:00:00Z',
    };
    const claim = {
      ...order('claim', 'Maria Santos', 'delivered'),
      parent_order_id: root.id,
      is_claim: true,
      created_at: '2026-06-03T08:00:00Z',
    };

    render(
      <BatchOrdersPanel
        batchNumber={7}
        orders={[root, repeat, claim]}
        loading={false}
        busy={false}
        requestConfirm={vi.fn()}
        onReload={vi.fn()}
        onSelectOrder={vi.fn()}
        onBulkUpdateStatus={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Print waybills (1)' })).toBeEnabled();
  });

  it('opens one combined preview for all printable customers', async () => {
    render(
      <BatchOrdersPanel
        batchNumber={7}
        orders={[
          order('maria', 'Maria Santos', 'confirmed'),
          order('jose', 'Jose Rizal', 'packing'),
        ]}
        loading={false}
        busy={false}
        requestConfirm={vi.fn()}
        onReload={vi.fn()}
        onSelectOrder={vi.fn()}
        onBulkUpdateStatus={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Print waybills (2)' }));

    expect(screen.getByRole('dialog', { name: 'Printable waybill' })).toBeInTheDocument();
    expect(screen.getByText('2 waybills ready to print')).toBeInTheDocument();
  });

  it('closes an open waybill preview when the selected batch changes', async () => {
    const sharedProps = {
      orders: [order('maria', 'Maria Santos', 'confirmed')],
      loading: false,
      busy: false,
      requestConfirm: vi.fn(),
      onReload: vi.fn(),
      onSelectOrder: vi.fn(),
      onBulkUpdateStatus: vi.fn(),
    };
    const { rerender } = render(<BatchOrdersPanel batchNumber={7} {...sharedProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'Print waybills (1)' }));
    expect(screen.getByRole('dialog', { name: 'Printable waybill' })).toBeInTheDocument();

    rerender(<BatchOrdersPanel batchNumber={8} {...sharedProps} />);

    expect(screen.queryByRole('dialog', { name: 'Printable waybill' })).not.toBeInTheDocument();
  });

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
