import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchOrderDetail } from './BatchOrderDetail';
import type { BatchOrder } from '../../types';
import type { ConfirmRequest } from './ConfirmDialog';

// Courier hook hits Supabase in production; stub it to a stable empty list.
vi.mock('../../hooks/useCouriers', () => ({
  useCouriers: () => ({ couriers: [] }),
}));

// Image upload hits ImageKit; stub it to resolve a stable URL.
vi.mock('../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    uploadImage: vi.fn(async () => 'https://cdn.example/balance.png'),
    uploading: false,
  }),
}));

function order(overrides: Partial<BatchOrder> = {}): BatchOrder {
  return {
    id: 'o1',
    order_number: 'PP-1001',
    customer_name: 'Maria Santos',
    customer_email: 'maria@example.com',
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
    subtotal: 1000,
    total_price: 1000,
    paid_total: null,
    shipping_fee: 0,
    payment_method_name: 'GCash',
    payment_proof_url: null,
    additional_payment_proof_url: null,
    payment_status: 'pending',
    order_status: 'packing',
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

function setup(o: BatchOrder) {
  const handlers = {
    onBack: vi.fn(),
    onConfirm: vi.fn(),
    onUpdateStatus: vi.fn(),
    onCancel: vi.fn(),
    onSaveTracking: vi.fn(),
    onSaveItems: vi.fn(),
    onVerifyBalance: vi.fn(),
    onAttachProof: vi.fn(),
  };
  let lastRequest: ConfirmRequest | null = null;
  const requestConfirm = vi.fn((req: ConfirmRequest) => {
    lastRequest = req;
  });
  render(
    <BatchOrderDetail
      order={o}
      products={[]}
      busy={false}
      requestConfirm={requestConfirm}
      {...handlers}
    />,
  );
  return { handlers, requestConfirm, getRequest: () => lastRequest };
}

describe('BatchOrderDetail status routing', () => {
  it('routes a move to Confirmed through onConfirm (paid-marking) even on a non-new order', async () => {
    const { handlers } = setup(order({ order_status: 'packing' }));

    await userEvent.selectOptions(screen.getByLabelText('Order status'), 'confirmed');

    expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
    expect(handlers.onUpdateStatus).not.toHaveBeenCalled();
  });

  it('routes Cancelled through the confirm dialog, not a direct status update', async () => {
    const { handlers, requestConfirm, getRequest } = setup(order({ order_status: 'confirmed' }));

    await userEvent.selectOptions(screen.getByLabelText('Order status'), 'cancelled');

    expect(requestConfirm).toHaveBeenCalledTimes(1);
    expect(getRequest()?.tone).toBe('danger');
    expect(handlers.onCancel).not.toHaveBeenCalled();
    getRequest()?.onConfirm();
    expect(handlers.onCancel).toHaveBeenCalledWith('o1');
  });

  it('applies an ordinary forward status directly via onUpdateStatus', async () => {
    const { handlers } = setup(order({ order_status: 'confirmed' }));

    await userEvent.selectOptions(screen.getByLabelText('Order status'), 'delivered');

    expect(handlers.onUpdateStatus).toHaveBeenCalledWith('o1', 'delivered');
    expect(handlers.onConfirm).not.toHaveBeenCalled();
  });
});

describe('BatchOrderDetail balance flow', () => {
  // paid_total 1000 + total 1500 => 500 owed for items added after payment.
  const balanceOrder = (over: Partial<BatchOrder> = {}) =>
    order({ paid_total: 1000, total_price: 1500, payment_status: 'pending', ...over });

  it('shows the balance-due banner and marks the balance paid', async () => {
    const { handlers } = setup(balanceOrder());

    expect(screen.getByText(/balance due/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /mark balance paid/i }));

    expect(handlers.onVerifyBalance).toHaveBeenCalledWith('o1');
  });

  it('soft-gates confirming an order that still owes a balance', async () => {
    const { handlers, requestConfirm, getRequest } = setup(
      balanceOrder({ order_status: 'new' }),
    );

    await userEvent.click(screen.getByRole('button', { name: /confirm order/i }));

    // Warns first; only proceeds once the admin accepts the override.
    expect(requestConfirm).toHaveBeenCalledTimes(1);
    expect(handlers.onConfirm).not.toHaveBeenCalled();
    getRequest()?.onConfirm();
    expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('hides the balance banner when nothing is owed', () => {
    setup(order({ paid_total: 1000, total_price: 1000, payment_status: 'paid' }));

    expect(screen.queryByText(/balance due/i)).not.toBeInTheDocument();
  });
});
