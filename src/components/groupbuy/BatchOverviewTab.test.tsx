import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchOverviewTab } from './BatchOverviewTab';
import type { BatchOrder, GroupBuyBatch, GroupBuyProgressItem } from '../../types';
import type { CapFillSummary, ItemRevenueSummary } from '../../utils/groupBuyOverview';

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

function itemRevenue(overrides: Partial<ItemRevenueSummary> = {}): ItemRevenueSummary {
  return {
    rows: [
      {
        product_id: 'p1',
        product_name: 'BPC-157 5mg',
        orderCount: 2,
        unitsOrdered: 3,
        unitsConfirmed: 2,
        unitsPending: 1,
        grossRevenue: 3000,
        collectedRevenue: 2000,
      },
    ],
    totalUnitsOrdered: 3,
    totalUnitsConfirmed: 2,
    totalUnitsPending: 1,
    totalGrossRevenue: 3000,
    totalCollectedRevenue: 2000,
    ...overrides,
  };
}

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

  it('shows the product status board with a confirmed/pending split and a phase headline', () => {
    render(
      <BatchOverviewTab
        batch={batch({ status: 'open' })}
        capSummary={capSummary}
        items={[
          progressItem({
            product_name: 'BPC-157 5mg',
            total_quantity: 18,
            confirmed_quantity: 12,
            cap_quantity: 20,
          }),
        ]}
        needsAction={[]}
        onViewOrder={vi.fn()}
        {...lifecycleProps()}
      />,
    );
    expect(screen.getByText('Product status board')).toBeInTheDocument();
    // While open, the headline column is "Left" (cap headroom = 20 − 18 = 2).
    expect(screen.getByRole('columnheader', { name: 'Left' })).toBeInTheDocument();
    expect(screen.getByText('BPC-157 5mg')).toBeInTheDocument();
    // Confirmed 12 shows on the row (and again in the footer total).
    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
  });

  it('switches the headline to "To take over" with freed units while finalizing', () => {
    const items = [
      progressItem({
        product_name: 'TB-500 10mg',
        total_quantity: 17,
        confirmed_quantity: 17,
        cancelled_quantity: 3,
        cap_quantity: 20,
      }),
    ];
    const { rerender } = render(
      <BatchOverviewTab
        batch={batch({ status: 'open' })}
        capSummary={capSummary}
        items={items}
        needsAction={[]}
        onViewOrder={vi.fn()}
        {...lifecycleProps()}
      />,
    );
    expect(screen.queryByRole('columnheader', { name: 'To take over' })).not.toBeInTheDocument();

    rerender(
      <BatchOverviewTab
        batch={batch({ status: 'finalizing' })}
        capSummary={capSummary}
        items={items}
        needsAction={[]}
        onViewOrder={vi.fn()}
        {...lifecycleProps()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'To take over' })).toBeInTheDocument();
    expect(screen.getByText(/3 freed/)).toBeInTheDocument();
  });

  it('hides the closeout panel while the batch is still open', () => {
    render(
      <BatchOverviewTab
        batch={batch({ status: 'open' })}
        capSummary={capSummary}
        orders={[order('1', 'Maria Santos')]}
        itemRevenue={itemRevenue()}
        needsAction={[]}
        onViewOrder={vi.fn()}
        {...lifecycleProps()}
      />,
    );
    expect(screen.queryByText('Group buy closeout')).not.toBeInTheDocument();
  });

  it('shows the closeout panel with revenue per item once the batch is closed', () => {
    render(
      <BatchOverviewTab
        batch={batch({ status: 'closed', fulfillment_stage: 'arrived_ph' })}
        capSummary={capSummary}
        orders={[order('1', 'Maria Santos')]}
        itemRevenue={itemRevenue()}
        needsAction={[]}
        onViewOrder={vi.fn()}
        {...lifecycleProps()}
      />,
    );
    expect(screen.getByText('Group buy closeout')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Collected' })).toBeInTheDocument();
    expect(screen.getByText('Arrived in PH')).toBeInTheDocument();
  });
});
