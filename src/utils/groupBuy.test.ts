import { describe, it, expect } from 'vitest';
import {
  findProgressItem,
  remainingForProduct,
  remainingAfterCart,
  isSoldOut,
  claimableRemaining,
  freedUnits,
  confirmedUnits,
  pendingUnits,
  resellableUnits,
  productDemandState,
  isPasaloEligible,
  filterPasaloProducts,
  canReopenClosedBatch,
  findVariationProgress,
  remainingForVariation,
  remainingForVariationAfterCart,
  isVariationSoldOut,
  isCartLineSoldOut,
  partitionCartAvailability,
} from './groupBuy';
import type {
  GroupBuyProgressItem,
  GroupBuyProgressVariation,
  GroupBuyBatch,
  GroupBuyStatus,
} from '../types';

const item = (over: Partial<GroupBuyProgressItem> = {}): GroupBuyProgressItem => ({
  product_id: 'p1',
  product_name: 'Tirzepatide',
  total_quantity: 0,
  confirmed_quantity: 0,
  order_count: 0,
  cancelled_quantity: 0,
  cap_quantity: null,
  ...over,
});

const variation = (
  over: Partial<GroupBuyProgressVariation> = {},
): GroupBuyProgressVariation => ({
  variation_id: 'v1',
  variation_name: '10mg',
  total_quantity: 0,
  cap_quantity: null,
  ...over,
});

// Minimal cart line shape the availability helpers care about (product id +
// optional variation id). Kept lightweight so these tests don't need a full
// Product/ProductVariation snapshot.
const line = (
  productId: string,
  variationId: string | null = null,
  quantity = 1,
) => ({
  product: { id: productId },
  variation: variationId ? { id: variationId } : null,
  quantity,
});

describe('findProgressItem', () => {
  it('returns the matching item by product id', () => {
    const items = [item({ product_id: 'a' }), item({ product_id: 'b' })];
    expect(findProgressItem(items, 'b')?.product_id).toBe('b');
  });

  it('returns undefined when no item matches', () => {
    expect(findProgressItem([item({ product_id: 'a' })], 'z')).toBeUndefined();
  });
});

describe('remainingForProduct', () => {
  it('returns null when there is no cap (unlimited)', () => {
    expect(remainingForProduct(item({ cap_quantity: null }))).toBeNull();
  });

  it('returns null when the item is missing', () => {
    expect(remainingForProduct(undefined)).toBeNull();
  });

  it('returns cap minus total when under cap', () => {
    expect(remainingForProduct(item({ cap_quantity: 100, total_quantity: 78 }))).toBe(22);
  });

  it('clamps to zero when total has reached or exceeded the cap', () => {
    expect(remainingForProduct(item({ cap_quantity: 100, total_quantity: 100 }))).toBe(0);
    expect(remainingForProduct(item({ cap_quantity: 100, total_quantity: 130 }))).toBe(0);
  });
});

describe('remainingAfterCart', () => {
  it('subtracts cart quantity from remaining', () => {
    expect(remainingAfterCart(item({ cap_quantity: 100, total_quantity: 78 }), 5)).toBe(17);
  });

  it('never goes negative', () => {
    expect(remainingAfterCart(item({ cap_quantity: 100, total_quantity: 78 }), 50)).toBe(0);
  });

  it('returns null when uncapped', () => {
    expect(remainingAfterCart(item({ cap_quantity: null }), 10)).toBeNull();
  });

  it('ignores negative cart quantities', () => {
    expect(remainingAfterCart(item({ cap_quantity: 10, total_quantity: 2 }), -5)).toBe(8);
  });
});

describe('isSoldOut', () => {
  it('is false when uncapped', () => {
    expect(isSoldOut(item({ cap_quantity: null }))).toBe(false);
  });

  it('is false when capacity remains', () => {
    expect(isSoldOut(item({ cap_quantity: 100, total_quantity: 99 }))).toBe(false);
  });

  it('is true when cap reached', () => {
    expect(isSoldOut(item({ cap_quantity: 100, total_quantity: 100 }))).toBe(true);
  });
});

describe('claimableRemaining', () => {
  it('returns null when the product is uncapped (unlimited)', () => {
    expect(claimableRemaining(item({ cap_quantity: null }))).toBeNull();
  });

  it('returns cap minus non-cancelled total when under cap', () => {
    expect(claimableRemaining(item({ cap_quantity: 50, total_quantity: 30 }))).toBe(20);
  });

  it('clamps to zero when the cap is exactly met', () => {
    expect(claimableRemaining(item({ cap_quantity: 50, total_quantity: 50 }))).toBe(0);
  });

  it('clamps to zero when the total somehow exceeds the cap', () => {
    expect(claimableRemaining(item({ cap_quantity: 50, total_quantity: 65 }))).toBe(0);
  });

  it('reflects units freed by cancellations via the reduced total', () => {
    // total_quantity excludes cancelled units, so a cancellation lowers it and
    // re-opens claimable capacity. 50 cap, 40 active after 10 were cancelled.
    expect(claimableRemaining(item({ cap_quantity: 50, total_quantity: 40, cancelled_quantity: 10 }))).toBe(10);
  });

  it('treats a zero cap as fully sold out', () => {
    expect(claimableRemaining(item({ cap_quantity: 0, total_quantity: 0 }))).toBe(0);
  });
});

describe('freedUnits', () => {
  it('returns the cancelled quantity for the product', () => {
    expect(freedUnits(item({ cancelled_quantity: 7 }))).toBe(7);
  });

  it('returns zero when nothing has been cancelled', () => {
    expect(freedUnits(item({ cancelled_quantity: 0 }))).toBe(0);
  });

  it('defaults to zero when cancelled_quantity is missing', () => {
    const withoutCancelled = { ...item(), cancelled_quantity: undefined } as unknown as GroupBuyProgressItem;
    expect(freedUnits(withoutCancelled)).toBe(0);
  });
});

describe('confirmedUnits / pendingUnits', () => {
  it('reports confirmed units straight from the aggregate', () => {
    expect(confirmedUnits(item({ total_quantity: 18, confirmed_quantity: 12 }))).toBe(12);
  });

  it('derives pending as total minus confirmed', () => {
    expect(pendingUnits(item({ total_quantity: 18, confirmed_quantity: 12 }))).toBe(6);
  });

  it('confirmed and pending add back up to the total', () => {
    const i = item({ total_quantity: 25, confirmed_quantity: 20 });
    expect(confirmedUnits(i) + pendingUnits(i)).toBe(i.total_quantity);
  });

  it('never returns negative pending when confirmed somehow exceeds total', () => {
    expect(pendingUnits(item({ total_quantity: 5, confirmed_quantity: 9 }))).toBe(0);
  });

  it('treats a missing confirmed_quantity as zero', () => {
    const missing = { ...item({ total_quantity: 4 }), confirmed_quantity: undefined } as unknown as GroupBuyProgressItem;
    expect(confirmedUnits(missing)).toBe(0);
    expect(pendingUnits(missing)).toBe(4);
  });
});

describe('resellableUnits', () => {
  it('returns null when the product is uncapped', () => {
    expect(resellableUnits(item({ cap_quantity: null }))).toBeNull();
  });

  it('equals the cap headroom and already absorbs freed units (no double count)', () => {
    // 20 cap, 17 active after 3 were cancelled → 3 available to resell, all freed.
    const i = item({ cap_quantity: 20, total_quantity: 17, cancelled_quantity: 3 });
    expect(resellableUnits(i)).toBe(3);
    expect(resellableUnits(i)).toBe(remainingForProduct(i));
  });

  it('is zero when a capped product is still full', () => {
    expect(resellableUnits(item({ cap_quantity: 20, total_quantity: 20 }))).toBe(0);
  });
});

describe('productDemandState', () => {
  it('headlines cap headroom labelled "Left" while open', () => {
    const state = productDemandState(
      item({ total_quantity: 18, confirmed_quantity: 12, cap_quantity: 20 }),
      'open',
    );
    expect(state.highlightLabel).toBe('Left');
    expect(state.highlight).toBe(2);
    expect(state.ordered).toBe(18);
    expect(state.confirmed).toBe(12);
    expect(state.pending).toBe(6);
  });

  it('headlines resellable units labelled "To take over" while finalizing', () => {
    const state = productDemandState(
      item({ total_quantity: 17, confirmed_quantity: 17, cancelled_quantity: 3, cap_quantity: 20 }),
      'finalizing',
    );
    expect(state.highlightLabel).toBe('To take over');
    expect(state.highlight).toBe(3);
    expect(state.freed).toBe(3);
  });

  it('headlines confirmed units once finalized or closed', () => {
    const base = item({ total_quantity: 18, confirmed_quantity: 12, cap_quantity: 20 });
    expect(productDemandState(base, 'finalized').highlight).toBe(12);
    expect(productDemandState(base, 'finalized').highlightLabel).toBe('Confirmed');
    expect(productDemandState(base, 'closed').highlight).toBe(12);
  });

  it('reports a null highlight for uncapped products while open or finalizing', () => {
    const uncapped = item({ total_quantity: 9, cap_quantity: null });
    expect(productDemandState(uncapped, 'open').highlight).toBeNull();
    expect(productDemandState(uncapped, 'finalizing').highlight).toBeNull();
  });

  it('flags products ordered beyond their cap', () => {
    const state = productDemandState(item({ total_quantity: 25, cap_quantity: 20 }), 'open');
    expect(state.overCap).toBe(true);
    expect(state.highlight).toBe(0);
  });
});

// Cancelled-aware progress semantics: a cancellation lowers total_quantity (which
// counts non-cancelled units only) and is surfaced separately as cancelled_quantity,
// so the cap helpers and the claim helper stay consistent after a cancel.
describe('cancelled-aware progress semantics', () => {
  it('frees a sold-out product back to claimable after a cancellation', () => {
    const soldOut = item({ cap_quantity: 50, total_quantity: 50, cancelled_quantity: 0 });
    expect(isSoldOut(soldOut)).toBe(true);
    expect(claimableRemaining(soldOut)).toBe(0);

    // One order of 5 units is cancelled: active total drops to 45, 5 freed.
    const afterCancel = item({ cap_quantity: 50, total_quantity: 45, cancelled_quantity: 5 });
    expect(isSoldOut(afterCancel)).toBe(false);
    expect(claimableRemaining(afterCancel)).toBe(5);
    expect(freedUnits(afterCancel)).toBe(5);
  });

  it('keeps remainingForProduct and claimableRemaining in agreement for capped items', () => {
    const i = item({ cap_quantity: 80, total_quantity: 55, cancelled_quantity: 12 });
    expect(remainingForProduct(i)).toBe(claimableRemaining(i));
  });
});

// Pasalo mode: the storefront re-opening filter. Shows ONLY products that have a
// batch cap AND still have remaining slots — capped-and-full and uncapped
// products are hidden so shoppers see only items that still need orders.
describe('isPasaloEligible', () => {
  it('is true for a capped product with remaining capacity', () => {
    expect(isPasaloEligible(item({ cap_quantity: 100, total_quantity: 78 }))).toBe(true);
  });

  it('is false for an uncapped (unlimited) product', () => {
    expect(isPasaloEligible(item({ cap_quantity: null }))).toBe(false);
  });

  it('is false for a capped product that is full', () => {
    expect(isPasaloEligible(item({ cap_quantity: 50, total_quantity: 50 }))).toBe(false);
    expect(isPasaloEligible(item({ cap_quantity: 50, total_quantity: 60 }))).toBe(false);
  });

  it('is false when there is no progress item for the product', () => {
    expect(isPasaloEligible(undefined)).toBe(false);
  });

  // Regression: a product with NO product-level cap but WITH variation-level caps
  // that still have remaining slots must appear in pasalo mode. This mirrors the
  // "5-Amino-1MQ" case where each variation (5mg/10mg/50mg) is capped individually
  // and only the parent product has "No cap".
  it('is true when a variation-only-capped product has a variation with remaining slots', () => {
    expect(
      isPasaloEligible(
        item({
          cap_quantity: null,
          total_quantity: 120,
          variations: [
            variation({ variation_id: '5mg', cap_quantity: 21, total_quantity: 17 }),
            variation({ variation_id: '10mg', cap_quantity: 10, total_quantity: 6 }),
            variation({ variation_id: '50mg', cap_quantity: 100, total_quantity: 97 }),
          ],
        }),
      ),
    ).toBe(true);
  });

  it('is false when every variation cap is full and there is no product cap', () => {
    expect(
      isPasaloEligible(
        item({
          cap_quantity: null,
          total_quantity: 31,
          variations: [
            variation({ variation_id: '5mg', cap_quantity: 21, total_quantity: 21 }),
            variation({ variation_id: '10mg', cap_quantity: 10, total_quantity: 10 }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it('is false for an uncapped product whose variations are also uncapped', () => {
    expect(
      isPasaloEligible(
        item({
          cap_quantity: null,
          variations: [
            variation({ variation_id: '5mg', cap_quantity: null }),
            variation({ variation_id: '10mg', cap_quantity: null }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it('is true when the product cap is full but a variation cap still has slots', () => {
    // Variation caps override the product cap for that variation, so a full product
    // pool must not hide a variation that still has capacity.
    expect(
      isPasaloEligible(
        item({
          cap_quantity: 30,
          total_quantity: 30,
          variations: [
            variation({ variation_id: '5mg', cap_quantity: 25, total_quantity: 10 }),
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe('filterPasaloProducts', () => {
  const products = [
    { id: 'capped-remaining' },
    { id: 'capped-full' },
    { id: 'uncapped' },
    { id: 'no-progress' },
  ];
  const items = [
    item({ product_id: 'capped-remaining', cap_quantity: 100, total_quantity: 40 }),
    item({ product_id: 'capped-full', cap_quantity: 30, total_quantity: 30 }),
    item({ product_id: 'uncapped', cap_quantity: null }),
  ];

  it('keeps only capped products that still have remaining slots', () => {
    expect(filterPasaloProducts(products, items).map((p) => p.id)).toEqual(['capped-remaining']);
  });

  it('returns an empty list when there is no progress data (no open batch)', () => {
    expect(filterPasaloProducts(products, [])).toEqual([]);
  });

  it('does not mutate the input product array', () => {
    const input = [...products];
    filterPasaloProducts(input, items);
    expect(input).toEqual(products);
  });

  it('keeps a variation-only-capped product with remaining variation slots', () => {
    const withVariationCaps = [{ id: 'variation-capped' }];
    const variationItems = [
      item({
        product_id: 'variation-capped',
        cap_quantity: null,
        total_quantity: 17,
        variations: [
          variation({ variation_id: '5mg', cap_quantity: 21, total_quantity: 17 }),
        ],
      }),
    ];
    expect(filterPasaloProducts(withVariationCaps, variationItems).map((p) => p.id)).toEqual([
      'variation-capped',
    ]);
  });
});

// Per-variation caps. A variation's OWN cap overrides the product cap for that
// variation. Variations without their own cap fall back to the product cap, which
// they share as a single pool (product cap − units of the uncapped variations).
// Neither cap set → unlimited. Backward compatible: a product cap with no variation
// caps behaves exactly like remainingForProduct (a shared total across variations).
describe('findVariationProgress', () => {
  it('returns the matching variation row by id', () => {
    const i = item({ variations: [variation({ variation_id: 'a' }), variation({ variation_id: 'b' })] });
    expect(findVariationProgress(i, 'b')?.variation_id).toBe('b');
  });

  it('returns undefined when the item has no variations', () => {
    expect(findVariationProgress(item(), 'a')).toBeUndefined();
  });

  it('returns undefined when no variation matches', () => {
    expect(findVariationProgress(item({ variations: [variation({ variation_id: 'a' })] }), 'z')).toBeUndefined();
  });

  it('returns undefined when the item is missing', () => {
    expect(findVariationProgress(undefined, 'a')).toBeUndefined();
  });
});

describe('remainingForVariation', () => {
  const mixed = item({
    cap_quantity: 10, // product-level cap
    total_quantity: 12, // capped 'x'(8) + uncapped 'y'(4)
    variations: [
      variation({ variation_id: 'x', cap_quantity: 20, total_quantity: 8 }),
      variation({ variation_id: 'y', cap_quantity: null, total_quantity: 4 }),
    ],
  });

  it('uses the variation cap when the variation has its own (override)', () => {
    // 20 cap − 8 ordered = 12, independent of the product cap of 10.
    expect(remainingForVariation(mixed, 'x')).toBe(12);
  });

  it('falls back to the shared product-cap pool for an uncapped variation', () => {
    // product cap 10 − uncapped pool used (total 12 − capped 8 = 4) = 6.
    expect(remainingForVariation(mixed, 'y')).toBe(6);
  });

  it('shares the fallback pool with variations that have no progress row', () => {
    expect(remainingForVariation(mixed, 'not-present')).toBe(6);
  });

  it('returns null (unlimited) when neither variation nor product is capped', () => {
    const uncapped = item({ cap_quantity: null, total_quantity: 4, variations: [variation({ variation_id: 'y' })] });
    expect(remainingForVariation(uncapped, 'y')).toBeNull();
  });

  it('returns null when the item is missing', () => {
    expect(remainingForVariation(undefined, 'y')).toBeNull();
  });

  it('never returns negative for an over-ordered variation cap', () => {
    const over = item({ variations: [variation({ variation_id: 'x', cap_quantity: 5, total_quantity: 9 })] });
    expect(remainingForVariation(over, 'x')).toBe(0);
  });

  it('never returns negative when the fallback pool is exhausted', () => {
    const drained = item({
      cap_quantity: 10,
      total_quantity: 25, // pool used 25 − 8 capped = 17 > cap
      variations: [variation({ variation_id: 'x', cap_quantity: 20, total_quantity: 8 })],
    });
    expect(remainingForVariation(drained, 'y')).toBe(0);
  });

  it('matches remainingForProduct when the product is capped and no variation is capped', () => {
    const productOnly = item({ cap_quantity: 30, total_quantity: 18 });
    expect(remainingForVariation(productOnly, null)).toBe(12);
    expect(remainingForVariation(productOnly, null)).toBe(remainingForProduct(productOnly));
  });
});

describe('remainingForVariationAfterCart', () => {
  const mixed = item({
    cap_quantity: 10,
    total_quantity: 12,
    variations: [
      variation({ variation_id: 'x', cap_quantity: 20, total_quantity: 8 }),
      variation({ variation_id: 'y', cap_quantity: null, total_quantity: 4 }),
    ],
  });

  it('subtracts the in-cart quantity from the variation remaining', () => {
    expect(remainingForVariationAfterCart(mixed, 'x', 5)).toBe(7);
  });

  it('never goes negative', () => {
    expect(remainingForVariationAfterCart(mixed, 'y', 50)).toBe(0);
  });

  it('ignores negative cart quantities', () => {
    expect(remainingForVariationAfterCart(mixed, 'x', -5)).toBe(12);
  });

  it('returns null when the variation is unlimited', () => {
    const uncapped = item({ cap_quantity: null, variations: [variation({ variation_id: 'y' })] });
    expect(remainingForVariationAfterCart(uncapped, 'y', 3)).toBeNull();
  });
});

describe('isVariationSoldOut', () => {
  it('is false when the variation is unlimited', () => {
    const uncapped = item({ cap_quantity: null, variations: [variation({ variation_id: 'y' })] });
    expect(isVariationSoldOut(uncapped, 'y')).toBe(false);
  });

  it('is true when the variation cap is reached', () => {
    const full = item({ variations: [variation({ variation_id: 'x', cap_quantity: 20, total_quantity: 20 })] });
    expect(isVariationSoldOut(full, 'x')).toBe(true);
  });

  it('is true when the shared fallback pool is exhausted', () => {
    const drained = item({ cap_quantity: 10, total_quantity: 10 });
    expect(isVariationSoldOut(drained, 'y')).toBe(true);
  });

  it('is false when the variation still has capacity', () => {
    const open = item({ variations: [variation({ variation_id: 'x', cap_quantity: 20, total_quantity: 5 })] });
    expect(isVariationSoldOut(open, 'x')).toBe(false);
  });
});

const batch = (over: Partial<GroupBuyBatch> = {}): GroupBuyBatch => ({
  id: 'b1',
  batch_number: 1,
  status: 'closed' as GroupBuyStatus,
  name: null,
  opened_at: '2026-06-01T00:00:00Z',
  closed_at: '2026-06-10T00:00:00Z',
  finalized_at: null,
  fulfillment_stage: null,
  ...over,
});

describe('canReopenClosedBatch', () => {
  it('allows reopening any closed batch when no other batch is open', () => {
    // Even an OLD closed batch is reopenable — the only rule is one open at a time.
    const target = batch({ id: 'b1', batch_number: 1, status: 'closed' });
    const all = [
      target,
      batch({ id: 'b2', batch_number: 2, status: 'closed' }),
      batch({ id: 'b3', batch_number: 3, status: 'finalized' }),
    ];
    expect(canReopenClosedBatch(target, all)).toBe(true);
  });

  it('allows reopening the latest closed batch when nothing else is open', () => {
    const target = batch({ id: 'b3', batch_number: 3, status: 'closed' });
    const all = [batch({ id: 'b2', batch_number: 2, status: 'closed' }), target];
    expect(canReopenClosedBatch(target, all)).toBe(true);
  });

  it('refuses when another batch already holds the single open slot', () => {
    const target = batch({ id: 'b1', batch_number: 1, status: 'closed' });
    const all = [target, batch({ id: 'b3', batch_number: 3, status: 'open' })];
    expect(canReopenClosedBatch(target, all)).toBe(false);
  });

  it('refuses a batch that is not closed', () => {
    const target = batch({ id: 'b3', batch_number: 3, status: 'finalized' });
    const all = [batch({ id: 'b2', batch_number: 2, status: 'closed' }), target];
    expect(canReopenClosedBatch(target, all)).toBe(false);
  });

  it('allows a lone closed batch', () => {
    const only = batch({ id: 'b1', batch_number: 1, status: 'closed' });
    expect(canReopenClosedBatch(only, [only])).toBe(true);
  });
});

describe('isCartLineSoldOut', () => {
  it('is false when there is no group-buy cap for the product (unlimited)', () => {
    expect(isCartLineSoldOut(line('p1'), [])).toBe(false);
  });

  it('is false when a capped product still has remaining slots', () => {
    const items = [item({ product_id: 'p1', cap_quantity: 10, total_quantity: 4 })];
    expect(isCartLineSoldOut(line('p1'), items)).toBe(false);
  });

  it('is true when a capped product has no remaining slots', () => {
    const items = [item({ product_id: 'p1', cap_quantity: 10, total_quantity: 10 })];
    expect(isCartLineSoldOut(line('p1'), items)).toBe(true);
  });

  it('is true when the product is filled past its cap', () => {
    const items = [item({ product_id: 'p1', cap_quantity: 10, total_quantity: 12 })];
    expect(isCartLineSoldOut(line('p1'), items)).toBe(true);
  });

  it('resolves per variation: sold-out variation is unavailable', () => {
    const items = [
      item({
        product_id: 'p1',
        cap_quantity: null,
        variations: [variation({ variation_id: 'v1', cap_quantity: 5, total_quantity: 5 })],
      }),
    ];
    expect(isCartLineSoldOut(line('p1', 'v1'), items)).toBe(true);
  });

  it('resolves per variation: a sibling variation with room is still available', () => {
    const items = [
      item({
        product_id: 'p1',
        cap_quantity: null,
        variations: [
          variation({ variation_id: 'v1', cap_quantity: 5, total_quantity: 5 }),
          variation({ variation_id: 'v2', cap_quantity: 5, total_quantity: 1 }),
        ],
      }),
    ];
    expect(isCartLineSoldOut(line('p1', 'v2'), items)).toBe(false);
  });
});

describe('partitionCartAvailability', () => {
  it('returns all lines as available when there are no caps', () => {
    const lines = [line('p1'), line('p2')];
    const { available, unavailable } = partitionCartAvailability(lines, []);
    expect(available).toEqual(lines);
    expect(unavailable).toEqual([]);
  });

  it('separates sold-out lines from available ones, preserving order', () => {
    const items = [
      item({ product_id: 'sold', cap_quantity: 4, total_quantity: 4 }),
      item({ product_id: 'ok', cap_quantity: 10, total_quantity: 2 }),
    ];
    const okLine = line('ok');
    const soldLine = line('sold');
    const { available, unavailable } = partitionCartAvailability([okLine, soldLine], items);
    expect(available).toEqual([okLine]);
    expect(unavailable).toEqual([soldLine]);
  });

  it('marks every line as unavailable when the whole cart is sold out', () => {
    const items = [item({ product_id: 'p1', cap_quantity: 2, total_quantity: 2 })];
    const { available, unavailable } = partitionCartAvailability([line('p1')], items);
    expect(available).toEqual([]);
    expect(unavailable).toHaveLength(1);
  });

  it('does not mutate the input array', () => {
    const items = [item({ product_id: 'p1', cap_quantity: 2, total_quantity: 2 })];
    const lines = [line('p1'), line('p2')];
    const snapshot = [...lines];
    partitionCartAvailability(lines, items);
    expect(lines).toEqual(snapshot);
  });
});
