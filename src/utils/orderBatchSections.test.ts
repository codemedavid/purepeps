import { describe, it, expect } from 'vitest';
import {
  groupOrdersIntoBatchSections,
  batchLabel,
  REGULAR_SECTION_ID,
  UNKNOWN_BATCH_SECTION_ID,
  type BatchSummary,
} from './orderBatchSections';

interface TestOrder {
  id: string;
  group_buy_batch_id: string | null;
  order_status: string;
}

const order = (
  id: string,
  group_buy_batch_id: string | null,
  order_status = 'confirmed',
): TestOrder => ({ id, group_buy_batch_id, order_status });

/** Batches arrive from Supabase already sorted by batch_number descending. */
const batches: BatchSummary[] = [
  { id: 'b3', batch_number: 3, name: 'Recovery drop', status: 'open' },
  { id: 'b2', batch_number: 2, name: null, status: 'closed' },
  { id: 'b1', batch_number: 1, name: 'First run', status: 'closed' },
];

const ids = <T extends { id: string }>(rows: readonly T[]): string[] => rows.map((r) => r.id);

describe('batchLabel', () => {
  it('names a batch by number and title', () => {
    expect(batchLabel(batches[0])).toBe('Batch #3 · Recovery drop');
  });

  it('falls back to the number alone when a batch is untitled', () => {
    expect(batchLabel(batches[1])).toBe('Batch #2');
  });
});

describe('groupOrdersIntoBatchSections', () => {
  it('gives each batch its own section, in the order the batches arrive', () => {
    const sections = groupOrdersIntoBatchSections(
      [order('a', 'b1'), order('b', 'b3'), order('c', 'b2')],
      batches,
    );

    expect(sections.map((s) => s.headline)).toEqual([
      'Batch #3 · Recovery drop',
      'Batch #2',
      'Batch #1 · First run',
    ]);
  });

  // The client's example: 15 / 8 / 12 across three batches.
  it('keeps every batch’s orders separate at different group sizes', () => {
    const a = Array.from({ length: 15 }, (_, i) => order(`a${i}`, 'b3'));
    const b = Array.from({ length: 8 }, (_, i) => order(`b${i}`, 'b2'));
    const c = Array.from({ length: 12 }, (_, i) => order(`c${i}`, 'b1'));

    const sections = groupOrdersIntoBatchSections([...a, ...b, ...c], batches);

    expect(sections.map((s) => s.orders.length)).toEqual([15, 8, 12]);
    expect(ids(sections[1].orders)).toEqual(ids(b));
  });

  // Requirement 4: printing one group must never reach another group's orders.
  it('never leaks an order into another batch’s printable set', () => {
    const sections = groupOrdersIntoBatchSections(
      [order('a1', 'b3'), order('b1', 'b2'), order('b2', 'b2'), order('c1', 'b1')],
      batches,
    );

    const seen = new Set<string>();
    for (const section of sections) {
      for (const printable of section.printableOrders) {
        expect(seen.has(printable.id)).toBe(false);
        seen.add(printable.id);
        expect(section.orders).toContain(printable);
      }
    }

    expect(ids(sections[1].printableOrders)).toEqual(['b1', 'b2']);
  });

  it('gives a batch holding a single order its own section', () => {
    const sections = groupOrdersIntoBatchSections([order('solo', 'b2')], batches);

    expect(sections).toHaveLength(1);
    expect(sections[0].headline).toBe('Batch #2');
    expect(ids(sections[0].orders)).toEqual(['solo']);
    expect(ids(sections[0].printableOrders)).toEqual(['solo']);
  });

  it('scales to many sections without mixing them up', () => {
    const many: BatchSummary[] = Array.from({ length: 40 }, (_, i) => ({
      id: `batch-${i}`,
      batch_number: 40 - i,
      name: null,
      status: 'closed',
    }));
    const orders = many.flatMap((batch, i) =>
      Array.from({ length: i + 1 }, (_, n) => order(`${batch.id}-${n}`, batch.id)),
    );

    const sections = groupOrdersIntoBatchSections(orders, many);

    expect(sections).toHaveLength(40);
    sections.forEach((section, i) => {
      expect(section.orders).toHaveLength(i + 1);
      expect(section.orders.every((o) => o.group_buy_batch_id === many[i].id)).toBe(true);
    });
  });

  it('skips batches with nothing in the current view', () => {
    const sections = groupOrdersIntoBatchSections([order('only', 'b2')], batches);

    expect(sections.map((s) => s.id)).toEqual(['b2']);
  });

  it('collects orders that belong to no batch into a trailing regular section', () => {
    const sections = groupOrdersIntoBatchSections(
      [order('plain', null), order('grouped', 'b3')],
      batches,
    );

    expect(sections.map((s) => s.id)).toEqual(['b3', REGULAR_SECTION_ID]);
    expect(sections[1].headline).toBe('Regular orders');
    expect(ids(sections[1].orders)).toEqual(['plain']);
  });

  // A batch row can be deleted while its orders live on. Those orders must still
  // reach paper rather than vanishing from the list.
  it('keeps orders whose batch is unknown in their own trailing section', () => {
    const sections = groupOrdersIntoBatchSections(
      [order('orphan', 'deleted-batch'), order('plain', null)],
      batches,
    );

    expect(sections.map((s) => s.id)).toEqual([UNKNOWN_BATCH_SECTION_ID, REGULAR_SECTION_ID]);
    expect(sections[0].headline).toBe('Group Buy');
    expect(ids(sections[0].orders)).toEqual(['orphan']);
  });

  it('excludes orders with no shipment from each section’s printable set', () => {
    const sections = groupOrdersIntoBatchSections(
      [
        order('new', 'b2', 'new'),
        order('cancelled', 'b2', 'cancelled'),
        order('packing', 'b2', 'packing'),
      ],
      batches,
    );

    expect(ids(sections[0].orders)).toEqual(['new', 'cancelled', 'packing']);
    expect(ids(sections[0].printableOrders)).toEqual(['packing']);
  });

  it('returns no sections for an empty view', () => {
    expect(groupOrdersIntoBatchSections([], batches)).toEqual([]);
  });

  it('leaves the caller’s arrays untouched', () => {
    const orders = [order('b', 'b1'), order('a', 'b3')];
    const snapshot = [...orders];

    groupOrdersIntoBatchSections(orders, batches);

    expect(orders).toEqual(snapshot);
  });
});
