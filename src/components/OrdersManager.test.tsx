import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Per-batch waybill printing on the Orders screen.
 *
 * The admin's Order List is sectioned by Group Buy batch, and each section owns
 * a print button that must reach that section's orders and nothing else. The
 * risk this file exists to cover is leakage: a button that quietly prints the
 * whole filtered view, or a neighbouring batch, wastes a print run and ships
 * the wrong waybill to the wrong customer.
 */

const stubs = vi.hoisted(() => ({
  batches: [
    { id: 'b3', batch_number: 3, name: 'Recovery drop', status: 'open' },
    { id: 'b2', batch_number: 2, name: null, status: 'closed' },
  ],
  orders: [] as Record<string, unknown>[],
  // Stable identities: a fresh literal per render re-triggers effects forever.
  menu: { refreshProducts: vi.fn() },
  couriers: { couriers: [], loading: false, addCourier: vi.fn(), updateCourier: vi.fn(), deleteCourier: vi.fn(), refetch: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        order: () =>
          Promise.resolve({
            data: table === 'group_buy_batches' ? stubs.batches : stubs.orders,
            error: null,
          }),
      }),
    }),
  },
}));
vi.mock('../hooks/useMenu', () => ({ useMenu: () => stubs.menu }));
vi.mock('../hooks/useCouriers', () => ({ useCouriers: () => stubs.couriers }));
vi.mock('../lib/posthog', () => ({ default: { capture: vi.fn(), identify: vi.fn() } }));

import OrdersManager from './OrdersManager';

function order(id: string, name: string, batchId: string | null, status = 'confirmed') {
  return {
    id,
    customer_name: name,
    customer_email: `${id}@example.com`,
    customer_phone: '09170000000',
    shipping_address: '1 Mabini St',
    shipping_barangay: null,
    shipping_city: 'Quezon City',
    shipping_state: 'NCR',
    shipping_zip_code: '1100',
    shipping_country: 'Philippines',
    shipping_location: null,
    shipping_fee: 0,
    order_items: [],
    total_price: 1000,
    payment_method_id: null,
    payment_method_name: null,
    payment_type: null,
    refunded_total: null,
    manually_confirmed_at: null,
    manually_confirmed_by: null,
    payment_proof_url: null,
    contact_method: null,
    order_status: status,
    payment_status: 'paid',
    notes: null,
    created_at: '2026-06-01T08:00:00Z',
    updated_at: '2026-06-01T08:00:00Z',
    tracking_number: null,
    shipping_provider: null,
    shipping_note: null,
    promo_code: null,
    discount_applied: null,
    order_number: `PP-${id}`,
    group_buy_batch_id: batchId,
  };
}

/** Batch #3 gets three orders, Batch #2 one, plus one ungrouped regular order. */
function seed() {
  stubs.orders = [
    order('a1', 'Ana Reyes', 'b3'),
    order('a2', 'Ben Cruz', 'b3'),
    order('a3', 'Cara Lim', 'b3'),
    order('b1', 'Dino Tan', 'b2'),
    order('r1', 'Elle Uy', null),
  ];
}

const section = (name: string) => screen.getByRole('region', { name });

describe('Orders screen — per-batch waybill printing', () => {
  it('gives every batch in view its own section', async () => {
    seed();
    render(<OrdersManager onBack={vi.fn()} />);

    expect(await screen.findByRole('region', { name: 'Batch #3 · Recovery drop' })).toBeInTheDocument();
    expect(section('Batch #2')).toBeInTheDocument();
    expect(section('Regular orders')).toBeInTheDocument();
  });

  it('prints only the clicked batch’s waybills', async () => {
    seed();
    render(<OrdersManager onBack={vi.fn()} />);
    await screen.findByRole('region', { name: 'Batch #3 · Recovery drop' });

    await userEvent.click(
      within(section('Batch #3 · Recovery drop')).getByRole('button', { name: /Print all waybills/ }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Printable waybill' });
    expect(within(dialog).getByText('3 waybills ready to print')).toBeInTheDocument();
    expect(within(dialog).getByText('Ana Reyes')).toBeInTheDocument();
    expect(within(dialog).queryByText('Dino Tan')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Elle Uy')).not.toBeInTheDocument();
  });

  it('prints a single-order batch without pulling in its neighbours', async () => {
    seed();
    render(<OrdersManager onBack={vi.fn()} />);
    await screen.findByRole('region', { name: 'Batch #2' });

    await userEvent.click(
      within(section('Batch #2')).getByRole('button', { name: /Print all waybills/ }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Printable waybill' });
    expect(within(dialog).getByText('Dino Tan')).toBeInTheDocument();
    expect(within(dialog).queryByText('Ana Reyes')).not.toBeInTheDocument();
  });

  it('counts only printable orders in a section’s button', async () => {
    stubs.orders = [
      order('n1', 'New Nel', 'b2', 'new'),
      order('x1', 'Gone Gil', 'b2', 'cancelled'),
      order('p1', 'Packed Pia', 'b2', 'packing'),
    ];
    render(<OrdersManager onBack={vi.fn()} />);
    await screen.findByRole('region', { name: 'Batch #2' });

    expect(
      within(section('Batch #2')).getByRole('button', { name: 'Print all waybills (1)' }),
    ).toBeEnabled();
  });

  it('keeps the existing per-order waybill button working', async () => {
    seed();
    render(<OrdersManager onBack={vi.fn()} />);
    await screen.findByRole('region', { name: 'Batch #2' });

    await userEvent.click(
      within(section('Batch #2')).getByRole('button', { name: /^Waybill$/ }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Printable waybill' });
    expect(within(dialog).getByText('Dino Tan')).toBeInTheDocument();
    expect(within(dialog).queryByText('Ana Reyes')).not.toBeInTheDocument();
  });

  it('still prints every shown order from the global button', async () => {
    seed();
    render(<OrdersManager onBack={vi.fn()} />);
    await screen.findByRole('region', { name: 'Batch #2' });

    await userEvent.click(screen.getByRole('button', { name: 'Print all waybills (5)' }));

    expect(
      within(screen.getByRole('dialog', { name: 'Printable waybill' })).getByText(
        '5 waybills ready to print',
      ),
    ).toBeInTheDocument();
  });

  it('narrows the sections to the batch filter', async () => {
    seed();
    render(<OrdersManager onBack={vi.fn()} />);
    await screen.findByRole('region', { name: 'Batch #2' });

    await userEvent.selectOptions(screen.getByRole('combobox'), 'b2');

    expect(screen.queryByRole('region', { name: 'Batch #3 · Recovery drop' })).not.toBeInTheDocument();
    expect(section('Batch #2')).toBeInTheDocument();
  });
});
