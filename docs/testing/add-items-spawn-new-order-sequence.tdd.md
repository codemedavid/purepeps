# TDD Evidence — Adding items spawns a new order sequence

**Source:** conversational request (no `*.plan.md`). Builds on the admin
order-grouping work and the earlier `link-repeat-orders-by-email` feature.

## Problem

Editing a customer's group-buy order and adding an item mutated the same order in
place (growing a "balance due"). The admin expected the added item to appear as a
**separate order sequence** under the same reference, with its own status and
payment confirmation.

## Decision

Adding a **new product** → a new linked order sequence (own `pending` payment /
`new` status). Editing/removing **existing lines** → in place (unchanged). The
"Add a product" control is only enabled while the batch is open, since a new
product becomes a separate order the DB trigger enforces against the open batch.

## User journeys

1. Admin adds a new product to a paid order in an open batch → it becomes Order 2
   under the same reference, `pending`/`new`; the original order is untouched.
2. Admin edits quantities / removes existing lines → the order updates in place
   (existing balance-due behavior preserved).
3. On a non-open batch, the admin cannot add new products (only correct lines).

## Task report

| Behavior | Validation command | RED → GREEN | Guarantee |
|---|---|---|---|
| Split kept vs added items | `vitest run src/utils/orderItemEdits.test.ts` | RED (module missing) → GREEN 7/7 | New products separate from edited/removed existing lines; variation-aware; duplicates count as additions |
| `addLinkedOrder` inserts a child order | `vitest run src/hooks/useBatchOrders.test.ts` | RED 3 failing → GREEN 10/10 | Child links to the ultimate root, copies customer identity, `pending`/`new`, own `next_order_number`, never pre-paid; throws (no insert) if the number RPC fails |
| Editor emits `(kept, added)` + open-gated add UI | `vitest run src/components/groupbuy/OrderItemsEditor.test.tsx` | GREEN 6/6 | Added product reported as addition; hint shown; add control hidden when `canAddProducts={false}` |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Brand-new product → `addedItems`, existing lines stay `keptItems` | `orderItemEdits.test.ts` | unit | PASS |
| 2 | Quantity edit / removal is kept in place, not an addition | `orderItemEdits.test.ts` | unit | PASS |
| 3 | Duplicate of an existing line becomes an addition | `orderItemEdits.test.ts` | unit | PASS |
| 4 | Linked order links to the ultimate root and copies identity | `useBatchOrders.test.ts` | hook/integration | PASS |
| 5 | Linked order is `pending`/`new`, never pre-paid | `useBatchOrders.test.ts` | hook/integration | PASS |
| 6 | Order-number RPC failure throws without inserting | `useBatchOrders.test.ts` | hook/integration | PASS |
| 7 | Editor splits added vs kept and shows the intent hint | `OrderItemsEditor.test.tsx` | component | PASS |
| 8 | Add control hidden when the batch is not open | `OrderItemsEditor.test.tsx` | component | PASS |

## Coverage / suite

- Full suite: `npx vitest run` → **524 passed / 46 files** (was 494).
- Types: `npx tsc --noEmit` → clean.

## Known gaps

- The `GroupBuyManager.handleSaveItems` routing (kept→`saveItems`, added→
  `addLinkedOrder`) is covered by construction + the unit/hook tests of its parts,
  not by a container-level test (the manager wires many Supabase-backed hooks).
- No new DB migration: relies on the existing `enforce_group_buy_on_order` trigger,
  which preserves an explicit non-null `parent_order_id` and counts added units
  against the batch cap.
