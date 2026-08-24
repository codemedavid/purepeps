import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LigwakManager from './LigwakManager';
import type { LigwakRecord } from '../../types';

const mockUseLigwak = vi.fn();
const mockRecordRefund = vi.fn();
const mockSetStatus = vi.fn();
const mockNotify = vi.fn();
const mockDownloadCsv = vi.fn();

vi.mock('../../hooks/useLigwak', () => ({
  useLigwak: (...args: unknown[]) => mockUseLigwak(...args),
}));
vi.mock('../../utils/downloadCsv', () => ({
  downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
}));
vi.mock('../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({ uploadImage: vi.fn(), uploading: false, uploadProgress: 0 }),
}));

function record(overrides: Partial<LigwakRecord> = {}): LigwakRecord {
  return {
    id: 'rec-1', allocation_id: 'a1', entry_id: 'e1', batch_id: 'b1', order_id: 'o1',
    order_number: 'PP-1042', ordered_at: '2026-08-02T09:00:00Z',
    customer_name: 'Juan Dela Cruz', customer_email: 'juan@example.com',
    customer_phone: '09170000000',
    product_id: 'p1', product_name: 'Retatrutide', variation_id: 'v1',
    variation_name: '10mg', quantity_mg: 10,
    total_quantity: 5, confirmed_quantity: 2, ligwak_quantity: 3,
    refund_amount: 3000, shipping_refunded: 0,
    payment_type: 'pay_now', payment_status: 'paid', payment_method_name: 'GCash',
    refund_status: 'for_review', refund_reference: null, refund_proof_url: null,
    refunded_at: null, reason: 'Incomplete kit.', admin_notes: null,
    customer_notified_at: null, batch_label: 'Batch 7',
    created_at: '2026-08-10T00:00:00Z', updated_at: '2026-08-10T00:00:00Z',
    ...overrides,
  };
}

describe('LigwakManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLigwak.mockReturnValue({
      records: [record()],
      loading: false,
      error: null,
      recordRefund: mockRecordRefund,
      setRefundStatus: mockSetStatus,
      notifyCustomers: mockNotify,
      refresh: vi.fn(),
    });
  });

  it('lists the ligwak records', () => {
    render(<LigwakManager onBack={vi.fn()} />);

    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
  });

  it('summarises what is outstanding', () => {
    render(<LigwakManager onBack={vi.fn()} />);

    expect(screen.getByTestId('outstanding-refunds')).toHaveTextContent('3,000');
  });

  it('filters to a single refund status', async () => {
    mockUseLigwak.mockReturnValue({
      records: [
        record(),
        record({ id: 'rec-2', customer_name: 'Maria Santos', refund_status: 'refunded' }),
      ],
      loading: false, error: null,
      recordRefund: mockRecordRefund, setRefundStatus: mockSetStatus,
      notifyCustomers: mockNotify, refresh: vi.fn(),
    });
    render(<LigwakManager onBack={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText(/filter by refund status/i), 'refunded');

    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.queryByText('Juan Dela Cruz')).not.toBeInTheDocument();
  });

  it('searches by customer, email or order number', async () => {
    mockUseLigwak.mockReturnValue({
      records: [record(), record({ id: 'rec-2', customer_name: 'Maria Santos' })],
      loading: false, error: null,
      recordRefund: mockRecordRefund, setRefundStatus: mockSetStatus,
      notifyCustomers: mockNotify, refresh: vi.fn(),
    });
    render(<LigwakManager onBack={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/search/i), 'Maria');

    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.queryByText('Juan Dela Cruz')).not.toBeInTheDocument();
  });

  it('exports the list that is currently on screen, not the unfiltered one', async () => {
    mockUseLigwak.mockReturnValue({
      records: [
        record(),
        record({ id: 'rec-2', customer_name: 'Maria Santos', refund_status: 'refunded' }),
      ],
      loading: false, error: null,
      recordRefund: mockRecordRefund, setRefundStatus: mockSetStatus,
      notifyCustomers: mockNotify, refresh: vi.fn(),
    });
    render(<LigwakManager onBack={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText(/filter by refund status/i), 'refunded');
    await userEvent.click(screen.getByRole('button', { name: /export/i }));

    const [, csv] = mockDownloadCsv.mock.calls[0];
    expect(csv).toContain('Maria Santos');
    expect(csv).not.toContain('Juan Dela Cruz');
  });

  it('notifies the affected customers on request', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LigwakManager onBack={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /notify/i }));

    expect(mockNotify).toHaveBeenCalledWith(['rec-1']);
  });

  it('opens the refund modal for a record', async () => {
    render(<LigwakManager onBack={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('surfaces a load error rather than an empty list', () => {
    mockUseLigwak.mockReturnValue({
      records: [], loading: false, error: 'Not authorized.',
      recordRefund: mockRecordRefund, setRefundStatus: mockSetStatus,
      notifyCustomers: mockNotify, refresh: vi.fn(),
    });
    render(<LigwakManager onBack={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorized/i);
  });

  it('goes back to the dashboard', async () => {
    const onBack = vi.fn();
    render(<LigwakManager onBack={onBack} />);

    await userEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(onBack).toHaveBeenCalled();
  });
});
