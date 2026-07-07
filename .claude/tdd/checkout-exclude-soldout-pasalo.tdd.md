# TDD Evidence — Exclude sold-out items from checkout (pasalo / group-buy mode)

## Source plan
No `*.plan.md` was supplied. User journeys were derived during this TDD run from
the bug report: during pasalo mode, a shopper should not be able to check out
items that are no longer available, and should only be able to check out the
remaining available items.

## User journeys
1. As a shopper in pasalo/group-buy mode, when one cart item's batch cap has
   filled up (sold out) while another item still has room, I want to check out
   only the available item, so that one sold-out line does not block my whole order.
2. As a shopper, I want sold-out cart lines clearly flagged as "no longer available"
   and excluded from my order total, so I understand what I am actually paying for.
3. As a shopper whose entire cart has sold out, I want checkout disabled with an
   explanation, so I am not sent to a broken/empty checkout.
4. As a shopper, I still want checkout blocked when an available line's quantity
   exceeds its remaining cap (existing over-cap guard preserved).

## Behaviour change
Before: `Cart` computed `capBlocked` over **all** cart lines; a sold-out line
(remaining ≤ 0) made `capBlocked` true and disabled the entire "Proceed to
Checkout" button, with no way to lower quantity to a valid value. Checkout also
received the full cart, so a stale sold-out line could be submitted.

After: sold-out lines (resolved per variation) are partitioned out. They are
flagged, excluded from the subtotal/total and from cap gating, and never passed
to `Checkout`. Checkout stays enabled while ≥1 line is available and is disabled
only when every line is sold out.

## Task report

### 1. Pure availability helpers (`src/utils/groupBuy.ts`)
- Added `isCartLineSoldOut(line, items)` and `partitionCartAvailability(lines, items)`.
- Cap resolution reuses existing `remainingForVariation` (variation cap overrides
  product cap; otherwise falls back to the product's shared pool).
- Validation command: `npx vitest run src/utils/groupBuy.test.ts`
- RED excerpt: `TypeError: partitionCartAvailability is not a function` (11 new assertions failed).
- GREEN: all `groupBuy.test.ts` tests pass.
- Guarantees: unlimited/uncapped lines are never sold out; a line is sold out iff
  its resolved remaining ≤ 0; partition preserves order and does not mutate input.

### 2. Subtotal extraction (`src/utils/cart.ts`, `src/hooks/useCart.ts`)
- Added pure `cartLineUnitPrice` + `cartSubtotal`; refactored `useCart.getTotalPrice`
  to reuse `cartSubtotal` and accept an optional item subset (defaults to full cart).
- Validation command: `npx vitest run src/utils/cart.test.ts`
- RED excerpt: `cartSubtotal is not a function`.
- GREEN: all `cart.test.ts` tests pass.
- Guarantees: subtotal honours variation price and active product discount; single
  source of truth shared by the cart summary and the persisted total.

### 3. Cart UI gating (`src/components/Cart.tsx`)
- Sold-out lines flagged with a "No longer available" badge, `+` disabled, dropped
  from subtotal and from the over-cap check; summary shows an amber notice; checkout
  disabled only when no available items remain.
- Validation command: `npx vitest run src/components/Cart.test.tsx`
- RED excerpt: `Cart` still disabled checkout / no "no longer available" text present.
- GREEN: all 5 `Cart.test.tsx` tests pass.

### 4. Checkout wiring (`src/App.tsx`)
- `availableCartItems = partitionCartAvailability(cart.cartItems, groupBuy.items).available`
  passed to `Checkout` as `cartItems`, with `totalPrice = cart.getTotalPrice(availableCartItems)`.
- Covered indirectly by the Cart component tests + typecheck; App is not unit-tested
  in this repo.

## Test specification

| # | What is guaranteed | Test file / name | Type | Result |
|---|--------------------|------------------|------|--------|
| 1 | Uncapped lines are never "sold out" | `groupBuy.test.ts:isCartLineSoldOut > is false when there is no group-buy cap` | unit | PASS |
| 2 | A cap-filled line is sold out; a sibling variation with room is not | `groupBuy.test.ts:isCartLineSoldOut > resolves per variation ...` | unit | PASS |
| 3 | Partition splits sold-out from available, preserving order, no mutation | `groupBuy.test.ts:partitionCartAvailability > ...` | unit | PASS |
| 4 | Subtotal honours variation price + active discount | `cart.test.ts:cartSubtotal > ...` | unit | PASS |
| 5 | Checkout stays enabled with an available item beside a sold-out one, and fires onCheckout | `Cart.test.tsx:lets the shopper check out when an available item sits beside a sold-out one` | component | PASS |
| 6 | Sold-out line is flagged "no longer available" | `Cart.test.tsx:flags the sold-out line as no longer available` | component | PASS |
| 7 | Sold-out items excluded from the order total | `Cart.test.tsx:excludes sold-out items from the order subtotal` | component | PASS |
| 8 | Checkout disabled when every item is sold out | `Cart.test.tsx:disables checkout when every item is sold out` | component | PASS |
| 9 | Available-but-over-cap line still blocks checkout (regression guard) | `Cart.test.tsx:still blocks checkout for an available item that exceeds its remaining cap` | component | PASS |

## Full validation
- `npx vitest run` → **713 passed (59 files)**.
- `npx tsc --noEmit` → exit 0 (clean).
- `npm run build` → built successfully.

## Known gaps / notes
- `npm run lint` currently crashes for the whole repo with
  `TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions'`
  — a pre-existing ESLint/@typescript-eslint version incompatibility, not caused by
  this change. `tsc --noEmit` is clean.
- Untracked WIP files (`src/utils/batchExports.ts`, `batchExports.test.ts`, `csv.ts`)
  exist from separate unfinished work; they pass in isolation and are not part of
  this change.
- The database trigger (`enforce_group_buy_on_order`) remains the authoritative
  server-side backstop; this change is the friendly client-side guard/UX.
- A sold-out line still shows its own per-line price on its (greyed) card; only the
  subtotal/total and the submitted order exclude it.
