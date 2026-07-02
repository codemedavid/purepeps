# Local Code Review — Group-buy order sequences (+ unrelated uncommitted work)

**Reviewed:** 2026-07-02
**Scope:** uncommitted changes (`git diff HEAD`)
**Decision:** APPROVE (my order-sequence changes, after fixing 1 HIGH) · the courier/shipping workstream has 1 unresolved HIGH owned separately

## Summary
The "one reference, multiple order sequences" feature (grouping + adding items spawns a new linked order) is correct, type-safe, and injection-free. One HIGH (optimistic draft reset masking save failures) was found in my code and fixed TDD-style. The working tree also contains a separate courier/shipping workstream with a HIGH (courier delete cascade) I did not author and left untouched.

## Findings

### CRITICAL
None.

### HIGH
1. **[FIXED] Optimistic draft reset masked save failures** — `src/components/groupbuy/OrderItemsEditor.tsx`
   `handleSave` reset the draft to kept lines unconditionally; because `handleSaveItems` was `void runAction(...)` and `runAction` swallows errors, a failed `addLinkedOrder` (RPC/network error, batch closing) still dropped the admin's added product with no way to retry.
   **Fix:** `runAction` now returns a success boolean, `handleSaveItems` returns that promise, and the editor only collapses the draft when the save did not return `false`. Added 2 tests (failure retains the line, success clears it).

2. **[NOT MINE — needs owner decision] Courier delete cascades shipping rates without warning** — `supabase/migrations/20260709000000_add_courier_id_to_shipping_locations.sql:7`
   `courier_id ... ON DELETE CASCADE` + the generic confirm in `CourierManager.tsx:47` means deleting a courier silently deletes all its `shipping_locations`, which can empty checkout's shipping list. Recommend `ON DELETE RESTRICT`/`SET NULL` or a clearer confirm message. Belongs to the separate shipping workstream in this working tree.

### MEDIUM
3. **[NOT MINE] Checkout shows no shipping option when `courier_id` is NULL** — `src/components/Checkout.tsx:1117`
   The new exact-match `loc.courier_id === selectedCourierId` filter silently yields zero options for legacy/fallback rows with `courier_id: null` (incl. `useShippingLocations` default fallback), blocking checkout with no message. Recommend an explicit empty-state message or backfilling a courier reference.

### LOW
None introduced by the order-sequence changes.

## Validation

| Check | Result |
|---|---|
| Type check (`tsc --noEmit`) | Pass |
| Lint (`eslint`) | Skipped — environment-broken (`@typescript-eslint` version mismatch crashes rule loading, pre-existing) |
| Tests (`vitest run`) | Pass — 526 / 46 files |
| Build | Pass (verified earlier in session) |

## Files reviewed (order-sequence feature)
- Added: `src/utils/batchOrderGroups.ts`, `src/utils/orderItemEdits.ts`, `src/components/groupbuy/BatchOrderRow.tsx`, `docs/testing/add-items-spawn-new-order-sequence.tdd.md`
- Modified: `src/hooks/useBatchOrders.ts`, `src/components/GroupBuyManager.tsx`, `src/components/groupbuy/OrderItemsEditor.tsx`, `BatchOrderDetail.tsx`, `BatchOrdersPanel.tsx` (+ their tests)

## Not reviewed in depth / out of scope
Separate uncommitted workstream (courier/shipping/KitCell/ProductStatusBoard): findings #2 and #3 above surfaced; no secrets, XSS, or SQL injection found; migration is idempotent. Owned separately — not modified.
