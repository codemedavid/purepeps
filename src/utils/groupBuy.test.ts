import { describe, it, expect } from 'vitest';
import {
  findProgressItem,
  remainingForProduct,
  remainingAfterCart,
  isSoldOut,
  claimableRemaining,
  freedUnits,
} from './groupBuy';
import type { GroupBuyProgressItem } from '../types';

const item = (over: Partial<GroupBuyProgressItem> = {}): GroupBuyProgressItem => ({
  product_id: 'p1',
  product_name: 'Tirzepatide',
  total_quantity: 0,
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
