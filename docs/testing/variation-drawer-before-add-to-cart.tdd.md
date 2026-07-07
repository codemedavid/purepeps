# TDD Evidence — Open variation drawer before add-to-cart

## Source plan

No `*.plan.md` was provided. The user journey below was derived during this TDD run from the request:

> "when adding to cart an item and there's a variation open the bottom sheet drawer first and allow to choose any variations first before adding to cart"

## User journeys

- As a shopper, when I tap **Add to cart** on a product card that has variations, I want the bottom sheet drawer to open so I can choose a format (and quantity) before anything is added to my cart — so I never accidentally buy the wrong variation.
- As a shopper, when I tap **Add to cart** on a product with no variations, I want it added straight to my cart with no extra step.

## Task report

### Behavior: cards with variations open the drawer instead of adding directly

**Summary:** `MenuItemCard`'s Add-to-cart button silently added `variations[0]` because `selectedVariation` always defaulted to the first format (`MenuItemCard.tsx:33-35`), making the existing `!selectedVariation` drawer-open guard dead code. The button now opens the bottom sheet drawer (`onProductClick`) whenever the product has variations; variation-less products still add directly.

**Root cause / fix:** `src/components/MenuItemCard.tsx` — the Add-to-cart `onClick` guard changed from `product.variations?.length > 0 && !selectedVariation` to `product.variations?.length > 0`.

**Validation command:** `npx vitest run src/components/MenuItemCard.test.tsx`

- **RED** (before fix): `Tests 2 failed | 1 passed (3)` — the two variation tests expected `onProductClick` but the card called `onAddToCart` (0 calls to `onProductClick`). The no-variation test already passed.
- **GREEN** (after fix): `Tests 3 passed (3)`.

**Guaranteed by the passing tests:** A card with one or more variations routes the shopper into the drawer and adds nothing to the cart from the card; a card with no variations calls `onAddToCart(product, undefined, 1)` and never opens the drawer.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | A single-variation product opens the drawer (`onProductClick`) and does not add to cart | `src/components/MenuItemCard.test.tsx:opens the bottom sheet drawer instead of adding directly when the product has variations` | unit (component) | PASS | `npx vitest run src/components/MenuItemCard.test.tsx` |
| 2 | A multi-variation product opens the drawer and does not add to cart | `src/components/MenuItemCard.test.tsx:opens the drawer when the product has multiple variations` | unit (component) | PASS | same |
| 3 | A variation-less product adds directly via `onAddToCart(product, undefined, 1)` and does not open the drawer | `src/components/MenuItemCard.test.tsx:adds directly to the cart when the product has no variations` | unit (component) | PASS | same |

## Coverage and known gaps

- Full suite: `npx vitest run` → **Test Files 61 passed (61), Tests 721 passed (721)**. No regressions.
- A dedicated coverage run was not executed (no `test:coverage` script; the project uses `vitest run`). The three new behavioral tests cover both branches of the changed conditional plus the unchanged direct-add path.
- `npx eslint` cannot run in this environment due to a pre-existing `@typescript-eslint/no-unused-expressions` rule-loading crash (ESLint 9.36.0 / plugin version mismatch). This is unrelated to the change and affects the whole repo.
- Not covered here (unchanged behavior, already tested elsewhere): the drawer's own variation selection, quantity bounds, and group-buy caps live in `ProductDetailModal.test.tsx`.

## Merge evidence

RED → 2 failing / 1 passing (`MenuItemCard.test.tsx`). GREEN → 3/3 passing, full suite 721/721. Checkpoint commits on `main`:
- `test:` add reproducer for opening variation drawer before add-to-cart (RED)
- `fix:` open variation drawer before adding a product to the cart (GREEN)
