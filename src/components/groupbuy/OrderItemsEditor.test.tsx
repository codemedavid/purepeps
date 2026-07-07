import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderItemsEditor } from './OrderItemsEditor';
import type { OrderLineItem, Product, ProductVariation } from '../../types';

function variation(overrides: Partial<ProductVariation> = {}): ProductVariation {
  return {
    id: 'v1',
    product_id: 'p1',
    name: '10mg',
    quantity_mg: 10,
    price: 1500,
    disposable_pen_price: null,
    reusable_pen_price: null,
    discount_price: null,
    discount_active: false,
    stock_quantity: 5,
    created_at: '2026-06-01T08:00:00Z',
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Retatrutide',
    description: '',
    category: 'peptide',
    base_price: 1000,
    discount_price: null,
    discount_start_date: null,
    discount_end_date: null,
    discount_active: false,
    purity_percentage: 99,
    molecular_weight: null,
    cas_number: null,
    sequence: null,
    storage_conditions: '',
    inclusions: null,
    stock_quantity: 10,
    available: true,
    featured: false,
    image_url: null,
    safety_sheet_url: null,
    created_at: '2026-06-01T08:00:00Z',
    updated_at: '2026-06-01T08:00:00Z',
    ...overrides,
  };
}

function setup(products: Product[], items: OrderLineItem[] = []) {
  const onSave = vi.fn();
  render(<OrderItemsEditor orderId="o1" items={items} products={products} onSave={onSave} />);
  return { onSave };
}

// A concrete line item factory for the order-switch tests below.
function line(overrides: Partial<OrderLineItem> = {}): OrderLineItem {
  return {
    product_id: 'p1',
    product_name: 'Retatrutide',
    variation_id: null,
    variation_name: null,
    quantity: 1,
    price: 1000,
    total: 1000,
    ...overrides,
  };
}

describe('OrderItemsEditor — adding with variations', () => {
  it('records the chosen variation id, name, and variation price', async () => {
    const user = userEvent.setup();
    const products = [
      product({ variations: [variation({ id: 'v1', name: '10mg', price: 1500 })] }),
    ];
    const { onSave } = setup(products);

    await user.selectOptions(screen.getByRole('combobox', { name: '' }), 'p1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Variation' }), 'v1');
    await user.click(screen.getByRole('button', { name: /add/i }));
    await user.click(screen.getByRole('button', { name: /save items/i }));

    // A brand-new product is reported as an addition (2nd arg), not a kept line.
    expect(onSave).toHaveBeenCalledWith(
      [],
      [
        expect.objectContaining({
          product_id: 'p1',
          variation_id: 'v1',
          variation_name: '10mg',
          price: 1500,
          quantity: 1,
          total: 1500,
        }),
      ],
    );
  });

  it('uses the discount price when the variation discount is active', async () => {
    const user = userEvent.setup();
    const products = [
      product({
        variations: [
          variation({ id: 'v1', name: '10mg', price: 1500, discount_active: true, discount_price: 1200 }),
        ],
      }),
    ];
    const { onSave } = setup(products);

    await user.selectOptions(screen.getByRole('combobox', { name: '' }), 'p1');
    await user.click(screen.getByRole('button', { name: /add/i }));
    await user.click(screen.getByRole('button', { name: /save items/i }));

    expect(onSave).toHaveBeenCalledWith(
      [],
      [expect.objectContaining({ variation_id: 'v1', price: 1200, total: 1200 })],
    );
  });

  it('adds a base-price line with null variation for products without variations', async () => {
    const user = userEvent.setup();
    const { onSave } = setup([product({ id: 'p1', name: 'Plain', base_price: 800 })]);

    expect(screen.queryByRole('combobox', { name: 'Variation' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: '' }), 'p1');
    await user.click(screen.getByRole('button', { name: /add/i }));
    await user.click(screen.getByRole('button', { name: /save items/i }));

    expect(onSave).toHaveBeenCalledWith(
      [],
      [
        expect.objectContaining({
          product_id: 'p1',
          variation_id: null,
          variation_name: null,
          price: 800,
        }),
      ],
    );
  });

  it('disables Add until a variation is chosen for a variant product', async () => {
    const user = userEvent.setup();
    // First variation is out of stock, so no in-stock default is selected.
    const products = [
      product({
        variations: [variation({ id: 'v1', name: '10mg', stock_quantity: 0 })],
      }),
    ];
    setup(products);

    await user.selectOptions(screen.getByRole('combobox', { name: '' }), 'p1');

    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });
});

describe('OrderItemsEditor — added vs kept split', () => {
  const existing: OrderLineItem = {
    product_id: 'p1',
    product_name: 'GHK-CU',
    variation_id: null,
    variation_name: null,
    quantity: 3,
    price: 198,
    total: 594,
  };

  it('keeps an existing line while splitting a newly added product into additions', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <OrderItemsEditor
        orderId="o1"
        items={[existing]}
        products={[product({ id: 'p2', name: 'AHK-CU', base_price: 400 })]}
        onSave={onSave}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: '' }), 'p2');
    await user.click(screen.getByRole('button', { name: /add/i }));
    // The intent hint appears before saving.
    expect(
      screen.getByText(/saved as a separate order under this customer's reference/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save items/i }));

    expect(onSave).toHaveBeenCalledWith(
      [existing],
      [expect.objectContaining({ product_id: 'p2', price: 400 })],
    );
  });

  it('keeps the added line in the draft when the save fails', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    render(
      <OrderItemsEditor
        orderId="o1"
        items={[existing]}
        products={[product({ id: 'p2', name: 'AHK-CU', base_price: 400 })]}
        onSave={onSave}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: '' }), 'p2');
    await user.click(screen.getByRole('button', { name: /add/i }));
    await user.click(screen.getByRole('button', { name: /save items/i }));

    // Save failed: the added product must remain so the admin can retry.
    expect(screen.getByText('AHK-CU')).toBeInTheDocument();
    expect(
      screen.getByText(/saved as a separate order under this customer's reference/i),
    ).toBeInTheDocument();
  });

  it('drops the added line from the draft after a successful save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <OrderItemsEditor
        orderId="o1"
        items={[existing]}
        products={[product({ id: 'p2', name: 'AHK-CU', base_price: 400 })]}
        onSave={onSave}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: '' }), 'p2');
    await user.click(screen.getByRole('button', { name: /add/i }));
    await user.click(screen.getByRole('button', { name: /save items/i }));

    // Success: the added product moved to its own order and leaves this editor.
    expect(screen.queryByText('AHK-CU')).not.toBeInTheDocument();
    expect(screen.getByText('GHK-CU')).toBeInTheDocument();
  });

  it('hides the add-product control when adding is not allowed', () => {
    render(
      <OrderItemsEditor
        orderId="o1"
        items={[existing]}
        products={[product({ id: 'p2', name: 'AHK-CU' })]}
        canAddProducts={false}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument();
  });
});

describe('OrderItemsEditor — switching between a customer\'s linked orders', () => {
  const products = [
    product({ id: 'p1', name: 'Retatrutide', base_price: 1000 }),
    product({ id: 'p2', name: 'GHK-CU', base_price: 200 }),
  ];

  // Bug repro: the admin opens Order A, then navigates to sibling Order B. The
  // editor must show Order B's items — not carry Order A's draft over — or a
  // save on B would persist A's items onto B and spawn a bogus linked order.
  it('reseeds the draft when the edited order changes', () => {
    const orderA = [line({ product_id: 'p1', product_name: 'Retatrutide', quantity: 2, total: 2000 })];
    const orderB = [line({ product_id: 'p2', product_name: 'GHK-CU', price: 200, quantity: 5, total: 1000 })];

    const { rerender } = render(
      <OrderItemsEditor orderId="A" items={orderA} products={products} onSave={vi.fn()} />,
    );
    expect(screen.getByText('Retatrutide')).toBeInTheDocument();

    // Navigate to a different linked order (new id + its own items).
    rerender(<OrderItemsEditor orderId="B" items={orderB} products={products} onSave={vi.fn()} />);

    expect(screen.getByText('GHK-CU')).toBeInTheDocument();
    expect(screen.queryByText('Retatrutide')).not.toBeInTheDocument();
  });

  // A save on order B must split against B's own items, never A's leftover draft.
  it('saves the current order\'s items after switching orders', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    const orderA = [line({ product_id: 'p1', product_name: 'Retatrutide', quantity: 2, total: 2000 })];
    const orderB = [line({ product_id: 'p2', product_name: 'GHK-CU', price: 200, quantity: 5, total: 1000 })];

    const { rerender } = render(
      <OrderItemsEditor orderId="A" items={orderA} products={products} onSave={onSave} />,
    );
    rerender(<OrderItemsEditor orderId="B" items={orderB} products={products} onSave={onSave} />);

    // The first spinbutton is the line-item quantity (the second is the
    // add-product form's qty). Bump it so the draft is dirty and Save enables.
    const qty = screen.getAllByRole('spinbutton')[0];
    await user.type(qty, '1'); // 5 -> 51, just needs to differ from the seed
    await user.click(screen.getByRole('button', { name: /save items/i }));

    // The saved line must be B's product (p2) at B's price — A's p1 must never
    // leak in. Its total tracks B's unit price, proving we split against B.
    const [keptItems, addedItems] = onSave.mock.calls.at(-1)!;
    expect(addedItems).toEqual([]);
    expect(keptItems).toHaveLength(1);
    expect(keptItems[0]).toMatchObject({ product_id: 'p2', price: 200, quantity: 51, total: 10200 });
  });

  // Guard against over-resetting: a same-order reload (same id, fresh array
  // identity after a save) must NOT wipe an in-progress edit.
  it('preserves an in-progress edit when the same order reloads', async () => {
    const user = userEvent.setup();
    const order = [line({ product_id: 'p1', product_name: 'Retatrutide', quantity: 2, total: 2000 })];

    const { rerender } = render(
      <OrderItemsEditor orderId="A" items={order} products={products} onSave={vi.fn()} />,
    );

    const qty = screen.getAllByRole('spinbutton')[0];
    await user.type(qty, '9'); // 2 -> 29
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(29);

    // Same order id, new array identity (e.g. parent re-fetched) — keep the edit.
    rerender(
      <OrderItemsEditor orderId="A" items={[...order]} products={products} onSave={vi.fn()} />,
    );

    // The in-progress edit survives — the draft was NOT reseeded to 2.
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(29);
  });
});
