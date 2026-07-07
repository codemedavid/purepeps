# TDD Evidence — Combined capped-variation remaining on the storefront card

## Source plan

No `*.plan.md` was supplied. Journeys were derived during this TDD run from the
request: *"When there's no cap on the products but there's cap on the variation,
combine the remaining caps then show it on the card to see that there's still
remaining on those items."*

## User journeys

- As a shopper, when a product has **no product-level cap** but its **variations
  are individually capped**, I want the card to pool those variation caps into one
  combined "still X left" figure, so I can see there is still capacity on those
  formats.
- As a shopper, when a product has no product cap **and** no variation caps
  (fully unlimited), I still want the plain live-demand "N reserved · M orders"
  line — the combined bar must not appear.

## Task report

### 1. `combinedVariationCaps()` cap-math helper

- **Summary:** Added a pure helper in `src/utils/groupBuy.ts` that rolls up a
  product's own-capped variations (when the product itself is uncapped) into
  `{ cap, reserved, remaining }`, reusing `remainingForVariation` so oversold
  variations floor at 0 and the bar never exceeds its cap.
- **RED:** `npx vitest run src/utils/groupBuy.test.ts` →
  `TypeError: combinedVariationCaps is not a function` (5 new tests failing,
  84 passing).
- **GREEN:** same command → **89 passed**.
- **Guarantees:** returns `null` for a missing item, for a product that carries
  its own cap, and for a product with no capped variations; sums cap/reserved/
  remaining across capped variations while ignoring uncapped ones; clamps
  oversold variations.

### 2. `MenuItemCard` combined-limit display

- **Summary:** When `cap_quantity == null`, the card computes
  `combinedVariationCaps(groupBuyItem)` and renders a "Group limit" progress bar
  plus "X left across formats" when variation caps exist; otherwise it falls back
  to the existing "Group orders" demand line.
- **RED:** `npx vitest run src/components/MenuItemCard.test.tsx` → the combined
  case failed (`Unable to find text /11 left/`), 4 passing.
- **GREEN:** same command → **5 passed**.
- **Guarantees:** the pooled remaining and reserved/cap totals render for
  no-product-cap + capped-variation products; the combined bar is absent (only
  the plain reserved line shows) when no variation is capped.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | `combinedVariationCaps` returns null for missing item / product-capped / no capped variation | `src/utils/groupBuy.test.ts:combinedVariationCaps` | unit | PASS | `npx vitest run src/utils/groupBuy.test.ts` |
| 2 | Sums cap, reserved, and remaining across capped variations, ignoring uncapped ones | `src/utils/groupBuy.test.ts:combinedVariationCaps` | unit | PASS | `npx vitest run src/utils/groupBuy.test.ts` |
| 3 | Oversold variation floors remaining at 0 and bar never exceeds cap | `src/utils/groupBuy.test.ts:combinedVariationCaps` | unit | PASS | `npx vitest run src/utils/groupBuy.test.ts` |
| 4 | Card shows combined "11 left" and "4 / 15 reserved" for no-product-cap + capped variations | `src/components/MenuItemCard.test.tsx:combined variation caps` | unit | PASS | `npx vitest run src/components/MenuItemCard.test.tsx` |
| 5 | Card falls back to plain "6 reserved" line when no variation is capped | `src/components/MenuItemCard.test.tsx:combined variation caps` | unit | PASS | `npx vitest run src/components/MenuItemCard.test.tsx` |

## Coverage and known gaps

- Full suite: `npx vitest run` → **728 passed (61 files)**.
- Typecheck: `npx tsc --noEmit` → clean.
- Gaps: the combined bar is display-only; add-to-cart gating still uses the
  selected variation's own headroom (`isVariationSoldOut`), unchanged here. The
  DB trigger `enforce_group_buy_on_order` remains the authoritative backstop.

## Merge evidence

If checkpoint commits are squashed, preserve this RED→GREEN summary:
- `test:` commit added the 5 reproducers (validated RED).
- `feat:` commit added `combinedVariationCaps` + the card bar (validated GREEN,
  full suite 728 passing, tsc clean).
