# TDD Evidence — Track the searched/selected order, not always the root

## Source plan
No `*.plan.md`. Journeys derived during this bug-fix TDD run from the reported defect:
a cancelled first order was linked (same email, same batch) to a newer order, but
tracking any order in the bundle only ever displayed the cancelled root.

## User journeys
- As a customer whose first order was cancelled, when I track (or tap) a **newer**
  order under the same tracking, I want to see **that** order's status — not the
  cancelled first order.
- As a customer with several orders under one tracking, I want to tap any card in
  "Your orders in this group buy" and have the main status card switch to it.

## Root cause
`OrderTracking.tsx` derived the displayed order as `sequencedOrders[0]?.order`
(always the root). The searched order number was ignored, and the linked-order
cards were non-interactive `<div>`s with no click handler.

## Fix
- Added `selectedOrderId` state.
- On a successful bundle fetch, default the selection to the order whose
  `order_number` matches the searched id (falls back to the root for shared-key
  lookups such as the balance re-fetch). posthog `tbs_order_tracked` now reports
  the tracked order too.
- Derived the main `order` from `selectedOrderId` (fallback root → first row).
- Made each "Your orders in this group buy" card a `<button>` that sets
  `selectedOrderId`, with a selected/active visual state (`aria-pressed`).

## Task report
| What is guaranteed | Test | Type | Result | Evidence |
|---|---|---|---|---|
| Searching a newer linked order shows that order (not the cancelled root) | `OrderTracking.test.tsx > linked repeat orders > shows the searched order in the main status card, not the root` | component | PASS | `vitest run src/components/OrderTracking.test.tsx` |
| Tapping a linked order card switches the main status card to it | `OrderTracking.test.tsx > linked repeat orders > switches the main status card when a linked order card is clicked` | component | PASS | same |
| Existing bundle/timeline/claim/balance behavior unchanged | remaining 39 tests in file | component | PASS | same |

## RED → GREEN
- RED: both new tests failed — main card rendered the cancelled root
  ("Order Cancelled" present, timeline "Placed" absent). Verified via
  `vitest run ... -t "linked repeat orders"` (2 failed / 3 passed).
- GREEN: after the fix, `vitest run src/components/OrderTracking.test.tsx` →
  **41 passed**. Full suite `vitest run` → **528 passed (46 files)**.

## Coverage / known gaps
- `tsc --noEmit -p tsconfig.app.json` reports 76 lines of **pre-existing**
  errors (unused vars + test-fixture optional/undefined mismatches) in files not
  touched here; identical with this change stashed. No new type errors.
- Not covered: E2E against the live Supabase `get_order_bundle` RPC (component
  tests mock the RPC).
