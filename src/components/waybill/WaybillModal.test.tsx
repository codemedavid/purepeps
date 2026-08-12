import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WaybillModal } from './WaybillModal';
import { buildWaybillData, type WaybillOrderInput } from '../../utils/waybill';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function waybill(id: string) {
  const input: WaybillOrderInput = {
    id,
    order_number: `PP-${id}`,
    customer_name: 'Test Customer',
    order_items: [{ product_name: 'AOD-9604', price: 500, quantity: 1, total: 500 }],
    order_status: 'confirmed',
    created_at: '2026-07-01T09:30:00Z',
  };
  return buildWaybillData(input);
}

describe('WaybillModal print structure', () => {
  // Regression: the `@media print` rules reveal only `.waybill-print-area`. If any
  // ancestor of that node carries `wb-no-print`, the `.wb-no-print *` rule (same
  // specificity, later in source order) wins the cascade and hides the waybill
  // itself — every printed page comes out blank. Guard against re-introducing it.
  it('never nests the print area inside a wb-no-print ancestor', () => {
    render(<WaybillModal waybills={[waybill('1')]} onClose={() => {}} />);

    const printArea = document.querySelector('.waybill-print-area');
    expect(printArea).not.toBeNull();

    let ancestor = printArea!.parentElement;
    while (ancestor && ancestor !== document.body) {
      expect(ancestor.classList.contains('wb-no-print')).toBe(false);
      ancestor = ancestor.parentElement;
    }
  });

  it('keeps the toolbar controls marked wb-no-print', () => {
    render(<WaybillModal waybills={[waybill('1')]} onClose={() => {}} />);
    const toolbar = document.querySelector('.wb-toolbar');
    expect(toolbar?.classList.contains('wb-no-print')).toBe(true);
  });

  it('renders one printable page per waybill', () => {
    render(<WaybillModal waybills={[waybill('1'), waybill('2'), waybill('3')]} onClose={() => {}} />);
    expect(document.querySelectorAll('.waybill-print-area .wb-page')).toHaveLength(3);
  });

  it('opens the browser print dialog exactly once from the preview', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<WaybillModal waybills={[waybill('1'), waybill('2')]} onClose={() => {}} />);

    await userEvent.click(document.querySelector<HTMLButtonElement>('.wb-btn-print')!);

    expect(print).toHaveBeenCalledTimes(1);
  });
});
