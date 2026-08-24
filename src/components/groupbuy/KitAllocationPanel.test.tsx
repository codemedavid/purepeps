import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import KitAllocationPanel from './KitAllocationPanel';
import type { KitAllocationPreview } from '../../types';

const preview: KitAllocationPreview = {
  batch_id: 'batch-1',
  allocations: [
    {
      product_id: 'p1',
      product_name: 'Retatrutide',
      variation_id: 'v1',
      variation_name: '10mg',
      kit_size: 10,
      total_confirmed_vials: 15,
      complete_kits: 1,
      ligwak_vials: 5,
      status: 'draft',
      entries: [
        {
          order_id: 'o1', order_number: 'PP-1001', sequence: 0,
          ordered_at: '2026-08-01T09:00:00Z', customer_name: 'Ana',
          quantity: 10, confirmed_qty: 10, ligwak_qty: 0,
          first_kit_index: 1, last_kit_index: 1,
        },
        {
          order_id: 'o2', order_number: 'PP-1002', sequence: 1,
          ordered_at: '2026-08-02T09:00:00Z', customer_name: 'Ben',
          quantity: 5, confirmed_qty: 0, ligwak_qty: 5,
          first_kit_index: 2, last_kit_index: 2,
        },
      ],
    },
  ],
  records: [],
  totals: { affected_orders: 1, ligwak_vials: 5, refund_owed: 5000 },
};

const noop = vi.fn();

function renderPanel(overrides: Partial<React.ComponentProps<typeof KitAllocationPanel>> = {}) {
  return render(
    <KitAllocationPanel
      preview={preview}
      locked={false}
      loading={false}
      error={null}
      onPreview={noop}
      onLock={noop}
      onRecalculate={noop}
      {...overrides}
    />,
  );
}

describe('KitAllocationPanel', () => {
  it('summarises each queue: kit size, complete kits and ligwak vials', () => {
    renderPanel();

    // By role: the product name also appears in the table's sr-only caption.
    expect(screen.getByRole('heading', { name: /Retatrutide/ })).toBeInTheDocument();
    expect(screen.getByTestId('complete-kits')).toHaveTextContent('1');
    expect(screen.getByTestId('ligwak-vials')).toHaveTextContent('5');
    expect(screen.getByText(/10 vials per kit/i)).toBeInTheDocument();
  });

  it('shows which customers and quantities completed each kit', () => {
    renderPanel();

    // Assert the whole row: Ana ordered 10 and all 10 were confirmed, so a bare
    // getByText('10') is ambiguous by construction.
    const anaRow = screen.getByRole('row', { name: /Ana/ });
    const cells = within(anaRow).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells).toEqual(['1', 'Ana', 'PP-1001', '10', '10', '—', 'Kit 1']);
  });

  it('marks the customers carrying the incomplete kit', () => {
    renderPanel();

    const benRow = screen.getByRole('row', { name: /Ben/ });
    expect(within(benRow).getByText(/ligwak/i)).toBeInTheDocument();
  });

  it('shows the money at stake before anything is committed', () => {
    renderPanel();

    expect(screen.getByText(/5,000/)).toBeInTheDocument();
  });

  it('lets the admin preview before committing anything', async () => {
    const onPreview = vi.fn();
    renderPanel({ onPreview });

    await userEvent.click(screen.getByRole('button', { name: /preview/i }));

    expect(onPreview).toHaveBeenCalled();
  });

  // Locking creates refund obligations against named customers. It must not be
  // a single unguarded click.
  it('confirms before locking the allocation', async () => {
    const onLock = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPanel({ onLock });

    await userEvent.click(screen.getByRole('button', { name: /lock/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(onLock).toHaveBeenCalled();
  });

  it('does not lock when the admin backs out of the confirmation', async () => {
    const onLock = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel({ onLock });

    await userEvent.click(screen.getByRole('button', { name: /lock/i }));

    expect(onLock).not.toHaveBeenCalled();
  });

  it('replaces locking with recalculation once the allocation is locked', () => {
    renderPanel({ locked: true });

    expect(screen.queryByRole('button', { name: /^lock/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recalculate/i })).toBeInTheDocument();
  });

  it('says the allocation is locked so nobody expects it to still move', () => {
    renderPanel({ locked: true });

    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });

  it('surfaces an error instead of pretending the preview succeeded', () => {
    renderPanel({ error: 'Not authorized to preview a kit allocation.' });

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorized/i);
  });

  it('tells the admin when every vial landed in a complete kit', () => {
    renderPanel({
      preview: {
        ...preview,
        allocations: [{ ...preview.allocations[0], ligwak_vials: 0, complete_kits: 2 }],
        totals: { affected_orders: 0, ligwak_vials: 0, refund_owed: 0 },
      },
    });

    expect(screen.getByText(/no ligwak/i)).toBeInTheDocument();
  });
});
