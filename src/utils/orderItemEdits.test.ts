import { describe, it, expect } from 'vitest';
import { splitEditedItems } from './orderItemEdits';
import type { OrderLineItem } from '../types';

function line(overrides: Partial<OrderLineItem> = {}): OrderLineItem {
  return {
    product_id: 'p1',
    product_name: 'GHK-CU',
    variation_id: null,
    variation_name: null,
    quantity: 1,
    price: 100,
    total: 100,
    ...overrides,
  };
}

describe('splitEditedItems', () => {
  it('treats every line as added when the order started empty', () => {
    const added = line({ product_id: 'p2', product_name: 'AHK-CU' });

    const result = splitEditedItems([], [added]);

    expect(result.keptItems).toEqual([]);
    expect(result.addedItems).toEqual([added]);
  });

  it('keeps an unchanged existing line and reports nothing added', () => {
    const original = line();

    const result = splitEditedItems([original], [original]);

    expect(result.keptItems).toEqual([original]);
    expect(result.addedItems).toEqual([]);
  });

  it('keeps an existing line whose quantity was edited, not as an addition', () => {
    const original = line({ quantity: 1, total: 100 });
    const edited = line({ quantity: 3, total: 300 });

    const result = splitEditedItems([original], [edited]);

    expect(result.keptItems).toEqual([edited]);
    expect(result.addedItems).toEqual([]);
  });

  it('splits a brand-new product line out from the existing ones', () => {
    const existing = line({ product_id: 'p1' });
    const brandNew = line({ product_id: 'p2', product_name: 'AHK-CU', price: 400, total: 400 });

    const result = splitEditedItems([existing], [existing, brandNew]);

    expect(result.keptItems).toEqual([existing]);
    expect(result.addedItems).toEqual([brandNew]);
  });

  it('matches on the variation, so the same product with a new variation is an addition', () => {
    const base = line({ product_id: 'p1', variation_id: 'v1', variation_name: '50mg' });
    const otherVariation = line({
      product_id: 'p1',
      variation_id: 'v2',
      variation_name: '100mg',
    });

    const result = splitEditedItems([base], [base, otherVariation]);

    expect(result.keptItems).toEqual([base]);
    expect(result.addedItems).toEqual([otherVariation]);
  });

  it('reports a removed existing line as neither kept nor added', () => {
    const a = line({ product_id: 'p1' });
    const b = line({ product_id: 'p2' });

    const result = splitEditedItems([a, b], [a]);

    expect(result.keptItems).toEqual([a]);
    expect(result.addedItems).toEqual([]);
  });

  it('treats a duplicate of an existing line as an addition (one match consumed)', () => {
    const original = line({ product_id: 'p1' });
    const duplicate = line({ product_id: 'p1' });

    const result = splitEditedItems([original], [original, duplicate]);

    expect(result.keptItems).toEqual([original]);
    expect(result.addedItems).toEqual([duplicate]);
  });
});
