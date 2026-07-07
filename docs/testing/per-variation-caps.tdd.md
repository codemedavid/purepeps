# TDD Evidence — Per-Variation Group-Buy Caps

**Source plan:** `~/.claude/plans/jolly-dazzling-clock.md` (approved). Journeys derived
from the user's request: "add a limit/cap per variation… expand a product in the
group buy, see its variations, add a cap there, so we can only buy the variation if it
has the cap or limit."

## Locked decisions
1. **Variation overrides product.** A variation with its own cap is governed by that
   cap. Variations without one fall back to the product cap. Neither set → unlimited.
2. **Uncapped = still buyable (unlimited).**
3. **Backward compatible:** a product cap with no variation caps behaves exactly as
   before — a shared total across the product's variations (the product cap governs
   the pool of variations that have no cap of their own).

## User journeys
- As an admin, I expand a product in the group-buy caps table and set a cap on a
  specific variation, so I can limit that variation independently.
- As a member, when I select a capped variation I can only order up to its remaining;
  the add button blocks at the variation limit even if the product has room.
- As the system, the order-insert trigger rejects any order that would push a variation
  (or the product's shared pool) past its cap.

## Task report

| Task | Summary | Command | RED → GREEN | Guarantees |
|------|---------|---------|-------------|-----------|
| Cap math | Pure variation-aware helpers | `npx vitest run src/utils/groupBuy.test.ts` | 20 failed ("not a function") → 69 passed | Override wins; uncapped variation draws the shared product pool; unlimited → null; never negative; `variationId=null` equals `remainingForProduct` |
| Hook | `setCap`/`removeCap` take `variationId` | `npx vitest run src/hooks/useGroupBuy.test.ts` | 4 failed → 11 passed | Product-level writes filter `variation_id IS NULL`; variation writes filter the id; delete-then-insert stays agnostic to the two partial unique indexes |
| Admin UI | Expandable per-variation cap editor | `npx vitest run src/components/groupbuy/CapsProgressTable.test.tsx` | new → 6 passed | Variation rows hidden until expanded; a cap editor per variation; save passes `(productId, variationId)`; remaining shows the variation's own cap |
| Storefront | Variation-aware add gating | `npx vitest run src/components/ProductDetailModal.test.tsx` | new → passed | Variation cap overrides the product cap in the reserved bar; add-to-cart blocks at the variation limit even with product room |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | A variation cap overrides the product cap for that variation | `groupBuy.test.ts:remainingForVariation > uses the variation cap …` | unit | PASS |
| 2 | Uncapped variations share the product-cap pool | `groupBuy.test.ts:remainingForVariation > falls back to the shared product-cap pool …` | unit | PASS |
| 3 | No cap anywhere → unlimited (null) | `groupBuy.test.ts:remainingForVariation > returns null (unlimited) …` | unit | PASS |
| 4 | Remaining never goes negative (variation cap and pool) | `groupBuy.test.ts:remainingForVariation > never returns negative …` | unit | PASS |
| 5 | Backward compat: `variationId=null` == `remainingForProduct` | `groupBuy.test.ts:remainingForVariation > matches remainingForProduct …` | unit | PASS |
| 6 | Variation sold-out detection | `groupBuy.test.ts:isVariationSoldOut > …` | unit | PASS |
| 7 | Hook scopes product- vs variation-level cap writes correctly | `useGroupBuy.test.ts:setCap/removeCap > …` | integration (mocked supabase) | PASS |
| 8 | Admin can expand a product and set a per-variation cap | `CapsProgressTable.test.tsx:variation expansion > …` | component | PASS |
| 9 | Storefront enforces the variation cap over the product cap | `ProductDetailModal.test.tsx:variation cap > …` | component | PASS |

## Coverage & gates
- Full suite: **672 passed / 57 files** (`npx vitest run`).
- Production build: **green** (`npm run build`).
- Lint: **not run** — the repo's ESLint is currently broken by a plugin/version
  mismatch (`@typescript-eslint/no-unused-expressions` throws on load, on the untouched
  `api/keepalive.ts`). Pre-existing; unrelated to this change.

## Known gaps (intentional)
- **Trigger + progress RPC SQL** (`enforce_group_buy_on_order`, `get_group_buy_progress`
  in `supabase/migrations/20260716000000_group_buy_variation_caps.sql`) have **no
  vitest harness** in this repo. Per the `src/utils/groupBuy.ts` header, the pure helpers
  are the tested mirror of the DB math; the SQL is the authoritative backstop and is
  validated by reasoning + the util mirror. Manual verification below.
- The Cart pre-submit guard checks each cart line's variation remaining; a rare case of
  *multiple* uncapped variations jointly overflowing the shared pool is caught by the
  authoritative trigger at submit, not the pre-submit guard.

## Manual verification (DB)
1. Apply the migration to a Supabase branch (`mcp__supabase__apply_migration`).
2. Open a batch; in the caps table expand a product, set a variation cap (e.g. 10mg → 5).
3. Place orders for that variation up to 5 → allowed; the 6th → trigger raises
   `Group buy limit reached…`; storefront add button reads "Group limit reached".
4. Confirm a different, uncapped variation of the same product is still buyable.
5. Confirm a product-level cap with no variation caps still behaves as before (shared
   total across variations).
