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
  render(<OrderItemsEditor items={items} products={products} onSave={onSave} />);
  return { onSave };
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

    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({
        product_id: 'p1',
        variation_id: 'v1',
        variation_name: '10mg',
        price: 1500,
        quantity: 1,
        total: 1500,
      }),
    ]);
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

    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({ variation_id: 'v1', price: 1200, total: 1200 }),
    ]);
  });

  it('adds a base-price line with null variation for products without variations', async () => {
    const user = userEvent.setup();
    const { onSave } = setup([product({ id: 'p1', name: 'Plain', base_price: 800 })]);

    expect(screen.queryByRole('combobox', { name: 'Variation' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: '' }), 'p1');
    await user.click(screen.getByRole('button', { name: /add/i }));
    await user.click(screen.getByRole('button', { name: /save items/i }));

    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({
        product_id: 'p1',
        variation_id: null,
        variation_name: null,
        price: 800,
      }),
    ]);
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
