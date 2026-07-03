# TDD Evidence — Minimum Order Quantity of 2 Vials

**Source plan:** `/ecc:tdd-workflow` request — "Make all the products have a minimum order of 2 vials." No `*.plan.md` file.
**Date:** 2026-07-04

## User Journeys
1. As a shopper, when I add any product to my cart, I want it to start at 2 vials, so that I always meet the per-product minimum order.
2. As a shopper, I want the product detail stepper to never drop below 2 vials, so that I cannot build an invalid order.
3. As a shopper, when I edit a line in my cart, I want the quantity to stay at or above 2 (or be removed entirely), so the minimum is always enforced.

## Design
A single business rule — **minimum order of 2 vials per product line** — enforced in one place (`useCart`, the source of truth for cart state) plus the product detail UI.

- `src/constants/order.ts` — `MIN_ORDER_QUANTITY = 2` (single source of truth).
- `useCart.addToCart` — a **new** cart line is floored to the minimum; increments on an existing line stay additive (the total is already ≥ minimum).
- `useCart.updateQuantity` — positive values below the minimum are clamped up to it; `0`/negative still removes the line.
- `ProductDetailModal` — initial quantity = minimum, decrement floors at the minimum, increment cap floors at the minimum. Stepper buttons also gained `aria-label`s.

## Task Report
| Task | Summary | Validation | RED → GREEN | Guarantee |
|---|---|---|---|---|
| Min-order constant | `MIN_ORDER_QUANTITY = 2` in `src/constants/order.ts` | imported by hook + modal + tests | n/a | One source of truth for the rule |
| Cart enforcement | Floor new lines and clamp `updateQuantity` in `src/hooks/useCart.ts` | `npx vitest run src/hooks/useCart.test.ts` | 7 failed → 34 passed | No cart line can hold < 2 of a product |
| Modal stepper | Initial/decrement/increment floor at min in `ProductDetailModal.tsx` | `npx vitest run src/components/ProductDetailModal.test.tsx` | 3 failed → 3 passed | Stepper starts at 2 and never drops below 2; Add to Cart sends ≥ 2 |

## Test Specification
| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | A new cart line defaults to the minimum quantity (2) | `useCart.test.ts:addToCart > adds a product to cart with the minimum order quantity by default` | unit | PASS |
| 2 | A below-minimum requested quantity is raised to the minimum | `useCart.test.ts:minimum order quantity > raises a below-minimum requested quantity up to the minimum for a new item` | unit | PASS |
| 3 | An above-minimum requested quantity is left unchanged | `useCart.test.ts:minimum order quantity > keeps an above-minimum requested quantity unchanged` | unit | PASS |
| 4 | `updateQuantity` clamps to the minimum instead of dropping below it | `useCart.test.ts:minimum order quantity > clamps updateQuantity to the minimum instead of dropping below it` | unit | PASS |
| 5 | Re-adding merges into one line and stays additive above the minimum | `useCart.test.ts:addToCart > increments quantity for existing item (...)` | unit | PASS |
| 6 | Modal stepper starts at the minimum | `ProductDetailModal.test.tsx:starts at the minimum order quantity` | unit | PASS |
| 7 | Modal decrement never goes below the minimum | `ProductDetailModal.test.tsx:does not let the shopper decrement below the minimum order quantity` | unit | PASS |
| 8 | Modal "Add to Cart" submits at least the minimum | `ProductDetailModal.test.tsx:adds to cart with at least the minimum order quantity` | unit | PASS |

## Coverage & Known Gaps
- Full suite: **570 passed / 52 files** (`npx vitest run`). Typecheck clean (`npx tsc --noEmit`).
- Stock-limited edge case: if a product's stock is `1`, the stock cap still wins over the minimum (you cannot sell what is not in stock), so that line can hold `1`. This is intentional and out of scope.
- `MenuItemCard` quick-add still passes `1`; the floor in `useCart.addToCart` upgrades the first add to 2, so no change was needed there.

## Merge / RED-GREEN Summary
- RED: 7 failing `useCart` assertions + 3 failing `ProductDetailModal` assertions, all caused by the missing minimum-order rule.
- GREEN: 570 passing, typecheck clean, after adding the constant and enforcing the floor in the cart hook and modal stepper.
