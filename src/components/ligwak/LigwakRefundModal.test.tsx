import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LigwakRefundModal from './LigwakRefundModal';
import type { LigwakRecord } from '../../types';

const mockUpload = vi.fn();
vi.mock('../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({ uploadImage: mockUpload, uploading: false, uploadProgress: 0 }),
}));

const record: LigwakRecord = {
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
};

const onClose = vi.fn();
const onRecordRefund = vi.fn();
const onSetStatus = vi.fn();

function renderModal(overrides = {}) {
  return render(
    <LigwakRefundModal
      record={record}
      onClose={onClose}
      onRecordRefund={onRecordRefund}
      onSetStatus={onSetStatus}
      {...overrides}
    />,
  );
}

describe('LigwakRefundModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onRecordRefund.mockResolvedValue(undefined);
    onSetStatus.mockResolvedValue(undefined);
    mockUpload.mockResolvedValue('https://cdn.example/proof.png');
  });

  it('shows who is being refunded and why', () => {
    renderModal();

    expect(screen.getByText(/Juan Dela Cruz/)).toBeInTheDocument();
    expect(screen.getByText(/PP-1042/)).toBeInTheDocument();
    expect(screen.getByText(/Retatrutide/)).toBeInTheDocument();
  });

  it('prefills the amount the system calculated', () => {
    renderModal();

    expect(screen.getByLabelText(/amount/i)).toHaveValue(3000);
  });

  it('records the refund with the reference and notes the admin entered', async () => {
    renderModal();

    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), '2700');
    await userEvent.type(screen.getByLabelText(/reference/i), 'GC-88213');
    await userEvent.type(screen.getByLabelText(/notes/i), 'Sent via GCash');
    await userEvent.click(screen.getByRole('button', { name: /mark.*refunded/i }));

    expect(onRecordRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: 'rec-1',
        amount: 2700,
        reference: 'GC-88213',
        notes: 'Sent via GCash',
      }),
    );
  });

  it('refuses to record a refund of zero', async () => {
    renderModal();

    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), '0');
    await userEvent.click(screen.getByRole('button', { name: /mark.*refunded/i }));

    expect(onRecordRefund).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/greater than zero/i);
  });

  // Refunding more than was taken is how a mistake becomes a loss.
  it('refuses to refund more than the calculated amount without an override', async () => {
    renderModal();

    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), '9999');
    await userEvent.click(screen.getByRole('button', { name: /mark.*refunded/i }));

    expect(onRecordRefund).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds/i);
  });

  it('lets the admin move the record through the workflow without paying yet', async () => {
    renderModal();

    await userEvent.selectOptions(screen.getByLabelText(/refund status/i), 'refund_processing');

    expect(onSetStatus).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: 'rec-1', status: 'refund_processing' }),
    );
  });

  it('uploads proof of refund and attaches it', async () => {
    renderModal();

    const file = new File(['proof'], 'proof.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/proof/i), file);

    expect(mockUpload).toHaveBeenCalledWith(file);
  });

  it('closes without recording anything', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalled();
    expect(onRecordRefund).not.toHaveBeenCalled();
  });
});
