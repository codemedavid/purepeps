# TDD evidence — pasalo mode: variation-aware checkout cap gate

**Source plan:** none. Journeys were derived during this TDD run from the reported bug:
"the CAGRI with other variation is already full but the other variations are not yet, but when
we tried to checkout that variation it says already full cap."

## User journeys

1. As a shopper in pasalo mode, I want to check out a product variation that still has slots,
   so that a sibling variation filling up does not block my order.
2. As a shopper, I still want a clear pre-submit message when the variation I actually picked
   is full, so that I fix the quantity instead of getting a raw database error.

## Root cause

`src/components/Checkout.tsx` bucketed cart lines **by product id only** and compared each
bucket against `remainingForProduct` (the product-level cap). Under the per-variation cap model
(`supabase/migrations/20260716000000_group_buy_variation_caps.sql`), a product's
`total_quantity` includes units of variations that carry their own caps. So once one variation
filled up, `remainingForProduct` hit 0 for the whole product and checkout rejected **every**
variation of it — including ones with their own untouched headroom.

`src/components/Cart.tsx` already resolved per variation, which is why the cart looked fine and
only the checkout screen complained.

## Task report

| Task | Summary | Validation command | Result |
|---|---|---|---|
| Reproduce | Added `findOverCapLines` specs incl. the CAGRI case (product cap full, sibling variation open) | `npx vitest run src/utils/groupBuy.test.ts` | RED — 9 failed / 89 passed, `TypeError: findOverCapLines is not a function` |
| Fix | Added `findOverCapLines` (buckets by product+variation, compares to `remainingForVariation`); Checkout now uses it; Cart's duplicate inline copy replaced by the same helper | `npx vitest run src/utils/groupBuy.test.ts` | GREEN — 98 passed |
| Regression | Full suite + typecheck of changed files | `npx vitest run`, `npx tsc --noEmit -p tsconfig.app.json` | 793 tests passed; no type errors in `groupBuy.ts`, `Cart.tsx`, `Checkout.tsx` |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A variation with its own headroom is NOT blocked when a sibling variation has filled the product-level cap | `src/utils/groupBuy.test.ts:does NOT block a variation with room when a sibling variation is full` | unit | PASS |
| 2 | The sibling variation that is actually full is still blocked | `…:still blocks the sibling variation that is actually full` | unit | PASS |
| 3 | A line exceeding its variation headroom is reported with its remaining count | `…:flags a line whose quantity exceeds its variation headroom` | unit | PASS |
| 4 | A line exactly filling the headroom is allowed | `…:allows a line that exactly fills the remaining variation headroom` | unit | PASS |
| 5 | Duplicate lines of the same variation are summed before the cap comparison | `…:sums duplicate lines of the same variation before comparing to the cap` | unit | PASS |
| 6 | Sibling variations are evaluated independently | `…:keeps sibling variations in separate buckets` | unit | PASS |
| 7 | Uncapped variations fall back to the shared product pool | `…:falls back to the shared product pool for uncapped variations` | unit | PASS |
| 8 | No caps at all → nothing blocked | `…:returns nothing when there are no caps at all` | unit | PASS |
| 9 | The helper never mutates the caller's cart array | `…:does not mutate the input lines` | unit | PASS |

## Coverage and known gaps

- Coverage was not measured: `@vitest/coverage-v8` is not installed in this repo and no
  `test:coverage` script exists. No dependency was added as part of this fix.
- Two test files fail to load both before and after this change and are unrelated to it:
  `src/hooks/useReturningCustomer.test.ts`, `src/utils/checkoutPrefill.test.ts`.
- Not covered by an automated test: the alert string now names the variation
  (`"CAGRI (10mg)"`), verified by reading `Checkout.tsx` only.
- The database trigger `enforce_group_buy_on_order` was reviewed and already resolves caps per
  variation correctly; it was not changed.

## Merge evidence

- RED: `147ee6f test: add reproducer for variation-aware pre-submit cap gate` — 9 failing.
- GREEN: `86e32f3 fix: resolve checkout cap gate per variation, not per product` — 98 passing
  in the target file, 793 across the suite.
- No separate refactor commit: Cart's duplicate gate was folded into the shared helper as part
  of the fix, with the suite green.
