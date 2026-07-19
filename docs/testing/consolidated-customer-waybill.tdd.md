# TDD Evidence — Consolidated customer waybill (one waybill per customer per group buy)

## Source plan

No `*.plan.md` was supplied. Journeys were derived during this TDD run from the
request: *"make the waybill have the total summary of the orders in all order
bumps or sequence that they have. 1 customer should be 1 waybill for all of his
orders on that one group buy."*

## User journeys

1. As an admin, I want one customer's order bumps / repeat checkouts / claim
   add-ons in a single group buy to print on **one** waybill, so I pack and ship
   the customer's whole batch order as a single parcel.
2. As an admin, I want that waybill's item table and totals to be the **sum**
   across all the customer's orders in the batch, so the customer sees the true
   grand total for everything they bought.
3. As an admin bulk-printing a batch, I want **one waybill per customer**, not one
   per order, so a customer with three orders yields one sheet, not three.

## Design decisions (business rules grounded in the code)

- **Admin/access fee counted once.** `GroupBuyBatch.access_fee` is documented as
  *"Members pay this per batch"* — so on a consolidated per-customer waybill the
  admin fee is charged once, not once per order.
- **Shipping fees sum** across the customer's orders (each order carried its own
  `shipping_fee`).
- **Root order supplies identity** (customer, address, reference number, QR
  tracking URL). Orders are supplied root-first by the existing batch grouping
  (`groupBatchOrders` → `sequenced` root-first, then `addOns`).
- **Cancelled / unconfirmed excluded.** Only `canPrintWaybill` statuses
  (confirmed and later fulfillment stages) consolidate — `printableGroupOrders`
  enforces this, matching the existing "print confirmed waybills" semantics.
- **Payment confirmed only when every consolidated order is paid**, so one unpaid
  bump cannot make the shared sheet read "Paid".
- Scope is **group-buy only** (per the request "on that one group buy").
  `OrdersManager` (regular orders) is unchanged.

## Task report

### Task 1 — `buildGroupWaybillData(orders, options)` pure consolidation util

- **Summary:** New pure function aggregates a customer's orders into one
  `WaybillData`; `buildWaybillData(order, opts)` now delegates to
  `buildGroupWaybillData([order], opts)` (DRY, preserves single-order behavior).
- **Validation command:** `npx vitest run src/utils/waybill.test.ts`
- **RED:** `TypeError: buildGroupWaybillData is not a function` — 7 new tests
  failed, 15 existing passed (function did not exist yet).
- **GREEN:** 22/22 passed after implementing the function and the two new
  `WaybillData` fields (`orderCount`, `orderNumbers`).
- **Guarantees:** items concatenate across orders; shipping sums; admin fee once;
  grand total correct; root identity used; single-order parity with
  `buildWaybillData`; payment confirmed only when all paid.

### Task 2 — Wire the group-buy print surfaces

- **Summary:** `printableGroupOrders(group)` (new, in `batchOrderGroups.ts`)
  returns a group's printable orders root-first. `BatchOrdersPanel` bulk print now
  emits one consolidated waybill per customer group; `BatchOrderDetail` "Print
  waybill" consolidates the open order's customer group (`waybillOrders` prop fed
  by `GroupBuyManager`). `Waybill.tsx` shows an "N orders · refs" tag when
  consolidated.
- **Validation command:**
  `npx vitest run src/utils/waybill.test.ts src/utils/batchOrderGroups.test.ts src/components/waybill`
  → **42 passed**. `npx tsc --noEmit` clean. `npm run build` succeeds.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Line items from every order concatenate into one table + subtotal | `waybill.test.ts › concatenates every order line item` | unit | PASS |
| 2 | Shipping sums, admin fee counted once, grand total correct | `waybill.test.ts › sums shipping across orders, counts admin fee once` | unit | PASS |
| 3 | Root (first) order supplies customer identity + reference | `waybill.test.ts › uses the first (root) order for the customer identity` | unit | PASS |
| 4 | Consolidated order count + references recorded | `waybill.test.ts › records how many orders were consolidated` | unit | PASS |
| 5 | Payment confirmed only when every order is paid | `waybill.test.ts › confirms payment only when every order is paid` | unit | PASS |
| 6 | QR encodes the root order tracking URL | `waybill.test.ts › encodes the root order tracking URL` | unit | PASS |
| 7 | Single-order group matches `buildWaybillData` | `waybill.test.ts › matches buildWaybillData for a single-order group` | unit | PASS |

## Coverage and known gaps

- Full suite: **807 passed, 1 failed**. The single failure
  (`Checkout.test.tsx › shipping already covered`) is **pre-existing on the branch
  baseline** — verified by stashing this change and re-running (still fails). It
  belongs to a separate in-progress "waive shipping on repeat orders" effort and
  is untouched by this change.
- No DB schema changes were made by this feature (pure util + component wiring).

## Merge evidence

RED: 7 new `buildGroupWaybillData` tests failed (`is not a function`).
GREEN: 22/22 `waybill.test.ts`, 42/42 across waybill + grouping + component
suites; `tsc` clean; `npm run build` green.
