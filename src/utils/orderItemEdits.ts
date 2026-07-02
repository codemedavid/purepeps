import type { OrderLineItem } from '../types';

/**
 * Split an edited order_items draft into the lines that stay on the SAME order
 * versus the brand-new products that should become a NEW linked order sequence.
 *
 * Admins edit a group-buy order's items inline. Changing a quantity or removing
 * a line stays in place on that order (a correction), but ADDING a new product
 * spawns a separate order under the same reference so it carries its own payment
 * confirmation and status — matching how a customer's own repeat checkout links
 * under one reference. See [[batchOrderGroups]] for the grouping this feeds.
 *
 * A line is "kept" when it matches an original line by product + variation; each
 * original is consumed at most once, so a duplicated line (same product added a
 * second time) is correctly reported as an addition. Side-effect free.
 */
export interface SplitEditedItems {
  readonly keptItems: OrderLineItem[];
  readonly addedItems: OrderLineItem[];
}

const lineKey = (item: OrderLineItem): string =>
  `${item.product_id}::${item.variation_id ?? ''}`;

export function splitEditedItems(
  original: readonly OrderLineItem[],
  draft: readonly OrderLineItem[],
): SplitEditedItems {
  // Count how many originals exist per key so each can be matched only once.
  const remaining = new Map<string, number>();
  for (const item of original) {
    const key = lineKey(item);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const keptItems: OrderLineItem[] = [];
  const addedItems: OrderLineItem[] = [];
  for (const item of draft) {
    const key = lineKey(item);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      keptItems.push(item);
    } else {
      addedItems.push(item);
    }
  }

  return { keptItems, addedItems };
}
