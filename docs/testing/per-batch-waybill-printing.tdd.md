# Per-batch "Print all waybills" in the Order List

## Source plan

No `*.plan.md`. Derived from the site owner's request for a per-"Group By"
print action, clarified in-thread to **per batch**.

## What was actually there

The request described fixing a Group By that printed all groups combined. The
inspection found no Group By to fix:

| Claimed | Actual |
|---|---|
| Order List groups orders, Print All prints every group combined | The list rendered **flat** — `filteredOrders.map(...)` at `OrdersManager.tsx:802`. No sections, no group headers, no grouping state. |
| Grouping is configurable | `OrdersManager` state was `orders`, `searchQuery`, `statusFilter`, `batchFilter`, `batches`, `selectedOrder`, `printQueue`, `isProcessing`, `isRefreshing`. Nothing else. |
| Printing leaked across groups | It could not. `printableWaybillOrders(filteredOrders)` already printed only what the filters left, so selecting one batch printed exactly that batch. |

The only grouping code in `src/` was `groupProductsIntoSections`
(`src/utils/catalogSections.ts`), which groups storefront **products by
category** — unrelated to orders, but the right shape to mirror.

So this is a feature build, not a bug fix. The real cost being paid was the
reselect loop: select batch → print → select next batch → print, once per drop,
with the reselect step as the place a wrong batch reaches paper.

## User journeys

1. As an admin closing several drops in one sitting, I want each batch in the
   Order List to carry its own print button, so that I can print a drop without
   first narrowing the whole list to it.
2. As an admin, I want a section's button to print that section's orders and
   nothing else, so that no customer receives another drop's waybill.
3. As an admin, I want status, batch and search narrowing to keep working, so
   that grouping refines the view I already had rather than replacing it.

## Task report

### 1. Partition the view into batch sections

`src/utils/orderBatchSections.ts`, mirroring `catalogSections.ts`. One section
per batch in the order the batches arrive — Supabase already sorts them by batch
number descending, the same order the filter dropdown lists — skipping batches
with nothing in view. Two trailing sections catch orders whose batch row was
deleted (`Group Buy`) and orders never part of a drop (`Regular orders`), so
nothing falls out of the list.

Each section's `printableOrders` is drawn from that section's own rows through
the existing `printableWaybillOrders`. There is no second print implementation.

- Command: `npx vitest run src/utils/orderBatchSections.test.ts`
- RED: `Failed to resolve import "./orderBatchSections"` — compile-time RED, the
  module did not exist.
- GREEN: `13 passed (13)`

### 2. Render the sections and wire the buttons

Each group renders as a `<section aria-labelledby>` with an `<h3>` heading, an
order count, and its own print button — so the group is a real landmark rather
than a styled `div`, and the accessible name is the batch label. The button
calls the same `setPrintQueue` the whole-view button and the per-order Waybill
button already call.

`orderSections` is memoised off `filteredOrders`, so grouping partitions what
the filters left rather than reaching around them.

- Command: `npx vitest run src/components/OrdersManager.test.tsx`
- RED: `7 failed (7)` — `Unable to find role="region" and name "Batch #3 · Recovery drop"`.
  The component rendered and reached its loaded state, so the failure was the
  missing sections and not broken mocks.
- GREEN: `8 passed (8)`

### 3. Confirm nothing else moved

`BatchSummary` and `batchLabel` moved out of `OrdersManager` into the utility
beside the grouping they feed, so the section heading and the dropdown label
cannot drift apart.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Each batch in view becomes its own section, ordered as the batches arrive | `orderBatchSections.test.ts:gives each batch its own section, in the order the batches arrive` | unit | PASS | `npx vitest run src/utils/orderBatchSections.test.ts` |
| 2 | Groups of 15 / 8 / 12 stay separate and keep their own members | `…:keeps every batch's orders separate at different group sizes` | unit | PASS | same |
| 3 | No order ever appears in two sections' printable sets, and every printable row belongs to its own section | `…:never leaks an order into another batch's printable set` | unit | PASS | same |
| 4 | A batch holding one order still gets its own section and print run | `…:gives a batch holding a single order its own section` | unit | PASS | same |
| 5 | 40 sections stay correctly partitioned | `…:scales to many sections without mixing them up` | unit | PASS | same |
| 6 | Batches with nothing in view are skipped | `…:skips batches with nothing in the current view` | unit | PASS | same |
| 7 | Ungrouped orders land in a trailing regular section | `…:collects orders that belong to no batch into a trailing regular section` | unit | PASS | same |
| 8 | Orders whose batch row is gone are kept, not dropped | `…:keeps orders whose batch is unknown in their own trailing section` | unit | PASS | same |
| 9 | `new` and `cancelled` are excluded from a section's print run | `…:excludes orders with no shipment from each section's printable set` | unit | PASS | same |
| 10 | Grouping does not mutate the caller's arrays | `…:leaves the caller's arrays untouched` | unit | PASS | same |
| 11 | Every batch in view renders as a labelled section | `OrdersManager.test.tsx:gives every batch in view its own section` | component | PASS | `npx vitest run src/components/OrdersManager.test.tsx` |
| 12 | Clicking a section's button opens the overlay holding only that section's customers | `…:prints only the clicked batch's waybills` | component | PASS | same |
| 13 | A single-order batch prints without pulling in neighbours | `…:prints a single-order batch without pulling in its neighbours` | component | PASS | same |
| 14 | A section's button counts only printable orders | `…:counts only printable orders in a section's button` | component | PASS | same |
| 15 | The existing per-order Waybill button still prints one order | `…:keeps the existing per-order waybill button working` | component | PASS | same |
| 16 | The whole-view button still prints every shown order | `…:still prints every shown order from the global button` | component | PASS | same |
| 17 | The batch filter still narrows which sections appear | `…:narrows the sections to the batch filter` | component | PASS | same |
| 18 | Search still narrows sections and section counts | `…:keeps search narrowing the sections` | component | PASS | same |

Requirements 1–7 of the request map onto rows 11–12 (identify the clicked
section), 3 and 12 (only that group's orders), 3 (no cross-group inclusion),
15 (individual printing preserved), 16–18 (existing filters preserved), and
5 (many sections).

## Coverage and known gaps

No `test:coverage` script exists in this repo, so no coverage percentage was
produced. Regression evidence instead:

- `npx vitest run` — **1891 tests passed**, up from 1871 before this work
  (13 utility + 8 component, one of which replaced nothing).
- The `2 failed` *files* are the pre-existing orphans (`checkoutPrefill.test.ts`,
  `useReturningCustomer.test.ts`), untouched and unrelated.
- `npx tsc --noEmit -p tsconfig.app.json` — 54 errors, identical to the
  pre-existing baseline, none in the files touched here.
- `npx vite build` — clean.

**Intentional gaps:**

- Row 18 (search) was written after the implementation rather than before it. It
  guards behaviour that already existed and had to survive the sectioned render,
  so it is a regression guard, not a red-first feature test.
- Not verified in a browser. The Orders screen sits behind admin auth and no
  screenshot was taken; the component tests drive the real `OrdersManager`
  against stubbed Supabase reads, which covers the wiring but not layout.
- Grouping is always on and always by batch, per the clarification. There is no
  Group By selector; if another axis is wanted later,
  `groupOrdersIntoBatchSections` takes the batch list as a parameter and a
  sibling key function would slot in beside it.

## Merge evidence

| Stage | Commit | Verified |
|---|---|---|
| RED | `ae6db5f test: add reproducer for per-batch waybill printing` | utility unresolved import; component `7 failed`, no `role=region` |
| GREEN | `c499ef1 feat: give every batch in the Order List its own waybill print run` | 13 + 8 passed; full suite 1891 passed; build clean |

No refactor commit — moving `BatchSummary`/`batchLabel` into the utility landed
inside the GREEN commit, with the suite green on both sides.

**Not deployed.** Both commits sit on `feat/gb-landing-homepage`, which still has
no upstream and has never been pushed.
