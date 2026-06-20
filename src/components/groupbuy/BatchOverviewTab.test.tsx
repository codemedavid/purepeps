import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchOverviewTab } from './BatchOverviewTab';
import type { BatchOrder, GroupBuyBatch } from '../../types';
import type { CapFillSummary } from '../../utils/groupBuyOverview';

function batch(overrides: Partial<GroupBuyBatch> = {}): GroupBuyBatch {
  return {
    id: 'b1',
    batch_number: 7,
    status: 'open',
    name: null,
    opened_at: '2026-06-01T00:00:00Z',
    closed_at: null,
    finalized_at: null,
    fulfillment_stage: null,
    ...overrides,
  };
}

function order(id: string, name: string): BatchOrder {
  return {
    id,
    order_number: `PP-${id}`,
    customer_name: name,
    customer_email: 'x@y.z',
    customer_phone: '0917',
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
  };
}

const capSummary: CapFillSummary = {
  cappedProducts: 2,
  totalCap: 80,
  totalReserved: 60,
  fillPct: 75,
  fullProducts: 1,
};

function lifecycleProps() {
  return {
    busy: false,
    requestConfirm: vi.fn(),
    onOpenBatch: vi.fn(),
    onOpenNewBatch: vi.fn(),
    onStartFinalizing: vi.fn(),
    onFinalize: vi.fn(),
    onReopen: vi.fn(),
    onClose: vi.fn(),
    onGoToOrders: vi.fn(),
  };
}

describe('BatchOverviewTab', () => {
  it('surfaces the orders that need confirmation and opens one on click', async () => {
    const onViewOrder = vi.fn();
    const needsAction = [order('1', 'Maria Santos'), order('2', 'Jose Rizal')];
    render(
      <BatchOverviewTab
        batch={batch()}
        capSummary={capSummary}
        needsAction={needsAction}
        onViewOrder={onViewOrder}
        {...lifecycleProps()}
      />,
    );

    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Maria Santos/ }));
    expect(onViewOrder).toHaveBeenCalledWith(needsAction[0]);
  });

  it('shows an all-caught-up state when nothing needs action', () => {
    render(
      <BatchOverviewTab
        batch={batch()}
        capSummary={capSummary}
        needsAction={[]}
        onViewOrder={vi.fn()}
        {...lifecycleProps()}
      />,
    );
    expect(screen.getByText(/caught up/i)).toBeInTheDocument();
  });

  it('renders the cap fill percentage when products are capped', () => {
    render(
      <BatchOverviewTab
        batch={batch()}
        capSummary={capSummary}
        needsAction={[]}
        onViewOrder={vi.fn()}
        {...lifecycleProps()}
      />,
    );
    expect(screen.getByText('75%')).toBeInTheDocument();
  });
});
