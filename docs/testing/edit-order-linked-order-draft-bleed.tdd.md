# TDD Evidence — Edit order on a customer: draft bleed + invisible save

**Source plan:** none — journeys derived during this TDD run from a bug report.

## User journeys

- As an admin, I want to edit the line items of one of a customer's linked
  group-buy orders and have the change save to **that** order only, so editing
  the latest order never rewrites the customer's other orders.
- As an admin, when I add a new product onto a customer's order (which becomes a
  separate linked order), I want to land on that newly created order so I can see
  it saved and confirm its payment — instead of being left on the parent with the
  added line silently gone.

## Bugs fixed

1. **Draft bleed across linked orders (data corruption).**
   `OrderItemsEditor` seeded its `draft` state from `items` only on mount
   (`useState(items)`). Navigating between a customer's linked orders (the sibling
   buttons in `BatchOrderDetail`) reused the same component instance, so `draft`
   kept the previously viewed order's items. Saving then ran
   `splitEditedItems(currentOrder.items, staleDraft)`, which treated the previous
   order's lines as additions and the current order's lines as removed — wiping
   the current order and spawning a bogus linked order. This is the reported
   "saving the latest order modifies all the other orders and makes them the one
   I added."
   **Fix:** reseed the draft during render when `orderId` changes (the supported
   React pattern for resetting state on a prop change), while preserving an
   in-progress edit on a same-order reload. `BatchOrderDetail` passes
   `orderId={order.id}`.

2. **Add-order saved but invisible.**
   Adding a product created a new linked order via `addLinkedOrder`, but the admin
   stayed on the parent order and the added line disappeared from the editor, so
   it read as "it just refreshed and didn't save."
   **Fix:** `addLinkedOrder` returns the new order id
   (`insert(...).select('id').single()`) and `GroupBuyManager.handleSaveItems`
   navigates to it.

## Task report

| Behavior | Validation command | Result | Guarantee |
|---|---|---|---|
| Draft reseeds when the edited order changes | `npx vitest run OrderItemsEditor.test.tsx` | RED→PASS | Switching to a sibling order shows that order's items; the prior order's lines never render |
| A save after switching splits against the current order | same | RED→PASS | `keptItems` carry the current order's product/price only; no bleed from the previous order |
| In-progress edit survives a same-order reload | same | RED→PASS | A dirty quantity is not thrown away when the same order re-fetches (new array identity, same id) |
| `addLinkedOrder` returns the new order id | `npx vitest run useBatchOrders.test.ts` | RED→PASS | Caller can navigate straight to the created order |

### RED evidence
`npx vitest run src/components/groupbuy/OrderItemsEditor.test.tsx src/hooks/useBatchOrders.test.ts`
→ `Tests 4 failed | 18 passed`. The failures included "Found multiple elements
with role spinbutton" — proof that both orders' line items rendered
simultaneously (stale draft).

### GREEN evidence
- `npx vitest run src/components/groupbuy/OrderItemsEditor.test.tsx src/hooks/useBatchOrders.test.ts` → `Tests 22 passed`.
- Full suite: `npx vitest run` → `Test Files 61 passed | Tests 739 passed`.
- Production build: `npx vite build` → `✓ built`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Editor shows the current order's items after switching orders | `OrderItemsEditor.test.tsx:reseeds the draft when the edited order changes` | unit | PASS |
| 2 | Save splits against the current order, never the previous draft | `OrderItemsEditor.test.tsx:saves the current order's items after switching orders` | unit | PASS |
| 3 | Same-order reload keeps an in-progress edit | `OrderItemsEditor.test.tsx:preserves an in-progress edit when the same order reloads` | unit | PASS |
| 4 | `addLinkedOrder` returns the new order id for navigation | `useBatchOrders.test.ts:returns the new order id so the caller can navigate to it` | unit | PASS |

## Coverage and known gaps

- The `GroupBuyManager.handleSaveItems` navigation wiring (one line:
  `setSelectedOrderId(newOrderId)`) is trivial glue over the unit-tested
  `addLinkedOrder` return value and is not separately unit-tested — the container
  pulls in many hooks that would need heavy mocking for marginal value.
- The literal "page refresh" symptom could not be reproduced from a `<form>`
  submit (the group-buy admin subtree has no forms and all buttons are
  `type="button"`); the observed behavior is fully explained by bugs #1 and #2
  above.

## Merge evidence (for squash)

- RED: `test: reproducer for order-item draft bleed across linked orders` — 4 failing.
- GREEN: `fix: edit-order on a customer saves to the right order and shows the new order` — 739 passing, build green.
