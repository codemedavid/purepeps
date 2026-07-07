import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CapsProgressTable, capDraftKey } from './CapsProgressTable';
import type { GroupBuyProgressItem } from '../../types';

const item = (over: Partial<GroupBuyProgressItem> = {}): GroupBuyProgressItem => ({
  product_id: 'p1',
  product_name: 'Retatrutide',
  total_quantity: 0,
  confirmed_quantity: 0,
  order_count: 0,
  cancelled_quantity: 0,
  cap_quantity: null,
  ...over,
});

const baseProps = {
  rows: [{ id: 'p1', name: 'Retatrutide' }],
  items: [item()],
  variationsByProduct: {
    p1: [
      { id: 'v10', name: '10mg' },
      { id: 'v5', name: '5mg' },
    ],
  },
  capDrafts: {},
  busy: false,
  onCapDraftChange: vi.fn(),
  onSaveCap: vi.fn(),
  onRemoveCap: vi.fn(),
};

describe('capDraftKey', () => {
  it('uses the bare product id for a product-level cap', () => {
    expect(capDraftKey('p1')).toBe('p1');
    expect(capDraftKey('p1', null)).toBe('p1');
  });

  it('namespaces a variation cap under the product', () => {
    expect(capDraftKey('p1', 'v10')).toBe('p1:v10');
  });
});

const twoProductProps = {
  ...baseProps,
  rows: [
    { id: 'p1', name: 'Retatrutide' },
    { id: 'p2', name: 'Tirzepatide' },
  ],
  items: [
    item({ product_id: 'p1', product_name: 'Retatrutide', order_count: 3, total_quantity: 5 }),
    item({ product_id: 'p2', product_name: 'Tirzepatide', order_count: 0, total_quantity: 0 }),
  ],
  variationsByProduct: {},
};

describe('CapsProgressTable order filter', () => {
  it('shows all products by default, including those with no orders', () => {
    render(<CapsProgressTable {...twoProductProps} />);
    expect(screen.getByText('Retatrutide')).toBeInTheDocument();
    expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
  });

  it('hides products with zero orders when the "with orders" filter is active', () => {
    render(<CapsProgressTable {...twoProductProps} />);
    fireEvent.click(screen.getByRole('button', { name: /with orders/i }));
    expect(screen.getByText('Retatrutide')).toBeInTheDocument();
    expect(screen.queryByText('Tirzepatide')).not.toBeInTheDocument();
  });

  it('restores all products when switching back to the "all" filter', () => {
    render(<CapsProgressTable {...twoProductProps} />);
    fireEvent.click(screen.getByRole('button', { name: /with orders/i }));
    fireEvent.click(screen.getByRole('button', { name: /^all/i }));
    expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
  });

  it('labels the "with orders" chip with the count of products that have orders', () => {
    render(<CapsProgressTable {...twoProductProps} />);
    expect(screen.getByRole('button', { name: /with orders \(1\)/i })).toBeInTheDocument();
  });

  it('shows an empty message when the filter hides every product', () => {
    const noneWithOrders = {
      ...twoProductProps,
      items: [
        item({ product_id: 'p1', order_count: 0 }),
        item({ product_id: 'p2', order_count: 0 }),
      ],
    };
    render(<CapsProgressTable {...noneWithOrders} />);
    fireEvent.click(screen.getByRole('button', { name: /with orders/i }));
    expect(screen.getByText(/no items with orders/i)).toBeInTheDocument();
  });
});

describe('CapsProgressTable variation expansion', () => {
  it('hides variation rows until the product is expanded', () => {
    render(<CapsProgressTable {...baseProps} />);
    expect(screen.queryByLabelText('Cap for Retatrutide — 10mg')).not.toBeInTheDocument();
  });

  it('reveals a cap editor per variation after expanding', () => {
    render(<CapsProgressTable {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/Expand variations for Retatrutide/));
    expect(screen.getByLabelText('Cap for Retatrutide — 10mg')).toBeInTheDocument();
    expect(screen.getByLabelText('Cap for Retatrutide — 5mg')).toBeInTheDocument();
  });

  it('calls onSaveCap with the product AND variation id when saving a variation cap', () => {
    const onSaveCap = vi.fn();
    render(<CapsProgressTable {...baseProps} onSaveCap={onSaveCap} />);
    fireEvent.click(screen.getByLabelText(/Expand variations for Retatrutide/));
    fireEvent.click(screen.getByLabelText('Save cap for Retatrutide — 10mg'));
    expect(onSaveCap).toHaveBeenCalledWith('p1', 'v10');
  });

  it('shows the variation remaining from its own cap (override)', () => {
    const withVariationCap = [
      item({
        cap_quantity: null,
        total_quantity: 8,
        variations: [{ variation_id: 'v10', variation_name: '10mg', total_quantity: 8, cap_quantity: 20 }],
      }),
    ];
    render(<CapsProgressTable {...baseProps} items={withVariationCap} />);
    fireEvent.click(screen.getByLabelText(/Expand variations for Retatrutide/));
    expect(screen.getByText('12 of 20')).toBeInTheDocument();
  });
});
