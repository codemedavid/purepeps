# Checkout Access-Tier Gate — TDD Evidence

## Source
Derived during this TDD run from a production bug screenshot: a shopper hit
`Failed to save order: Your access tier does not include the category
"c0a80121-0001-4e78-94f8-585d77059001". ...` at the final checkout step. The
category was shown as a raw UUID, and the rejection only surfaced after the
server rejected the insert.

## Root cause (two parts)
1. **Server message showed a UUID.** `enforce_tier_on_order` raised the offending
   `products.category` value verbatim. `products.category` stores the category
   UUID as TEXT, so the shopper saw a UUID. Fixed in migration
   `tier_error_category_name` (applied, version `20260629131432`) which resolves
   the UUID to `categories.name` (falling back to the raw value). Verified live
   via `pg_get_functiondef('public.enforce_tier_on_order')`.
2. **Client let the order reach the server before failing.** `Checkout` now
   mirrors the server trigger: it computes `lockedItems` and blocks
   "Proceed to Payment", surfacing a named, actionable banner. Critically it
   re-derives each cart item's category from the **live** `products` prop rather
   than the cart's persisted snapshot, so the client check matches the server
   (which reads live `products`). This is the part covered by the new tests.

## User journeys
- As a member whose tier excludes a category, I want checkout to tell me which
  items are blocked and stop me before submitting, so I don't hit an opaque
  server error.
- As a member, if the catalog re-categorised a product after it entered my cart,
  I want the gate to use the product's current category so the client and server
  agree.

## Task report
- **Behavior implemented:** client-side tier gate in `src/components/Checkout.tsx`
  (`itemCategory`, `lockedItems`, banner, `!hasLockedItems` in `isDetailsValid`).
- **RED:** temporarily reverted `itemCategory` to read the stale cart snapshot
  (`item.product.category`) and ran the suite — the live-category regression test
  failed (`getByText(/Some items are outside your access tier/i)` not found),
  proving it reproduces the screenshot bug. Command:
  `npx vitest run src/components/Checkout.test.tsx -t "access tier gate"` →
  `1 failed | 3 passed`.
- **GREEN:** restored the live-catalog lookup and reran:
  `npx vitest run src/components/Checkout.test.tsx` → `21 passed`.
  Full suite: `npx vitest run` → `41 files, 450 passed`.

## Test specification
| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Items outside the member tier are named and Proceed to Payment is disabled | `Checkout.test.tsx › access tier gate › blocks checkout and names items...` | unit | PASS |
| 2 | No banner when every cart category is within the tier | `Checkout.test.tsx › access tier gate › allows checkout when every cart category...` | unit | PASS |
| 3 | Gate follows the LIVE catalog category, not the stale cart snapshot (the screenshot bug) | `Checkout.test.tsx › access tier gate › gates on the LIVE catalog category...` | unit | PASS (RED-verified) |
| 4 | No gating when no tier restriction is supplied (backward compatible) | `Checkout.test.tsx › access tier gate › does not gate any items when no tier restriction...` | unit | PASS |

## Coverage / known gaps
- The server message fix (`tier_error_category_name`) is exercised in the live DB
  and confirmed via `pg_get_functiondef`; it has no automated SQL test here.
- The full place-order rejection path (`handlePlaceOrder` → server error →
  shopper-friendly `alert` without the support footer) is covered by code review,
  not an automated test, because it requires the order-insert mock to throw a
  tier error; the pre-submit gate (tested above) prevents reaching it in normal
  flow.
