# TDD Evidence — Caps "with orders" filter

## Source plan
No `*.plan.md` supplied. Journey derived during this TDD run from the request:
"add a filter on the caps/items table to only show items that have orders."

## User journey
As a group-buy admin, I want to filter the "Orders per item" caps table to show
only products that already have orders, so I can focus on items that need caps
without scrolling past the ones nobody has ordered yet.

## Task report
Added an in-component order filter to `CapsProgressTable` (Caps tab of
`GroupBuyManager`). Two chips — "All" and "With orders" — toggle whether products
with `order_count === 0` are hidden. `order_count` is already present per product
in `GroupBuyProgressItem` (from the `get_group_buy_progress` RPC), so no new data
fetch was needed. The chip style matches the existing `BatchOrdersPanel` filter chips.

- Validation command: `npx vitest run src/components/groupbuy/CapsProgressTable.test.tsx`
- RED: 4 filter tests failed — `Unable to find role="button" name /with orders/i`
  (the chip did not exist). The pre-existing "shows all by default" assertion passed.
- GREEN: 11/11 passed after adding `FILTER_CHIPS`, `onlyWithOrders` state,
  `visibleRows`, and the filter-aware empty state.
- Full suite: `npx vitest run` → 57 files / 677 tests passed.
- Type check: `npx tsc --noEmit` → clean.

Guaranteed by the passing tests: the table shows every product by default;
activating "With orders" hides zero-order products and keeps ordered ones;
toggling back to "All" restores them; the chip reports the ordered-product count;
and an empty filtered view shows a "No items with orders yet." message.

## Test specification
| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | All products shown by default, incl. zero-order ones | `CapsProgressTable.test.tsx:shows all products by default` | unit | PASS | `vitest run CapsProgressTable.test.tsx` |
| 2 | "With orders" filter hides zero-order products | `CapsProgressTable.test.tsx:hides products with zero orders when the "with orders" filter is active` | unit | PASS | same |
| 3 | Switching back to "All" restores hidden products | `CapsProgressTable.test.tsx:restores all products when switching back to the "all" filter` | unit | PASS | same |
| 4 | "With orders" chip labels the ordered-product count | `CapsProgressTable.test.tsx:labels the "with orders" chip with the count` | unit | PASS | same |
| 5 | Empty filtered view shows an explanatory message | `CapsProgressTable.test.tsx:shows an empty message when the filter hides every product` | unit | PASS | same |

## Coverage and known gaps
No new branches left untested: default view, filtered view, toggle-back, chip
count, and empty-filtered state are all covered. The filter is client-side and
presentational; it does not alter cap math or data fetching, both already covered
by existing `CapsProgressTable` and `groupBuy` util tests.
