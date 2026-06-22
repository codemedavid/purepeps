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
} from './groupBuy';
import type { GroupBuyProgressItem } from '../types';

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
