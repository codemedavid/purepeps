# TDD Evidence — Per-Batch "View-Only Mode" (browse before launch)

**Source plan:** conversational `/ecc:plan` output (this session). No `*.plan.md` file.
**Date:** 2026-07-07

## User Journeys
1. As an admin, I want to toggle "View-only mode" on the open group-buy batch, so shoppers can browse products before the drop goes live without adding anything to their cart.
2. As a shopper, when view-only mode is on I want to see the products and open their details, but Add-to-Cart is disabled ("Coming soon"), so I can look but not order yet.
3. As an admin, when I flip view-only off ("allow adding now"), Add-to-Cart becomes live everywhere and ordering resumes normally.
4. As a shopper, when no batch is open / the flag is off / data is still loading, the storefront behaves exactly as before (never mis-gated).

## Task Report
| Task | Summary | Validation | RED → GREEN | Guarantee |
|---|---|---|---|---|
| Admin setter | `useGroupBuy.setViewOnlyMode` calls `set_group_buy_view_only_mode` RPC | `npx vitest run src/hooks/useGroupBuy.test.ts` | 2 failed (`setViewOnlyMode is not a function`) → passed | Admin can flip the flag; guarded by `is_admin()` in the RPC |
| Card gate | `MenuItemCard` folds `isViewOnly` into `canAdd`, labels CTA "Coming soon" | `npx vitest run src/components/MenuItemCard.test.tsx` | 2 failed (no "Coming soon" / added anyway) → passed | Disabled CTA never adds to cart; card body still opens the detail drawer for viewing |
| Drawer gate | `ProductDetailModal` disables add + labels "Coming soon" when `isViewOnly` | `npx vitest run src/components/ProductDetailModal.test.tsx` | 2 failed → passed | The variation drawer's add button never adds in view-only mode |
| DB migration | `group_buy_batches.view_only_mode` column, `set_group_buy_view_only_mode` RPC, `get_group_buy_progress` emits `view_only_mode` (rebuilt on the variation-caps version → per-variation breakdown preserved) | `npm run build` (type surface) | n/a (SQL) | Flag persists per batch; storefront RPC carries it |
| Types | `GroupBuyBatch.view_only_mode` + progress `batch` Pick | `npx tsc --noEmit` | n/a | Type-safe flag end to end |
| Storefront wire | `App.tsx` computes `viewOnly` (open batch + flag), threads through `Menu` → card + drawer | `npm run build` | n/a | No open batch / flag off / loading → normal storefront |

## Test Specification
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Enabling view-only calls the RPC with `p_enabled: true` | `useGroupBuy.test.ts:setViewOnlyMode > enables view-only mode via the set_group_buy_view_only_mode RPC` | unit | PASS |
| 2 | Disabling ("allow adding now") calls the RPC with `p_enabled: false` | `useGroupBuy.test.ts:setViewOnlyMode > disables view-only mode ("allow adding now")` | unit | PASS |
| 3 | Card CTA is disabled and labeled "Coming soon" in view-only mode | `MenuItemCard.test.tsx:view-only mode > disables the CTA and labels it "Coming soon"` | unit | PASS |
| 4 | Card never adds to cart from the disabled CTA (viewing/drawer stays allowed) | `MenuItemCard.test.tsx:view-only mode > never adds to cart from the disabled CTA` | unit | PASS |
| 5 | Drawer add button is disabled and labeled "Coming soon" in view-only mode | `ProductDetailModal.test.tsx:view-only mode > disables the add button and labels it "Coming soon"` | unit | PASS |
| 6 | Drawer never adds to cart when clicked in view-only mode | `ProductDetailModal.test.tsx:view-only mode > does not add to cart when the button is clicked` | unit | PASS |

## Design Note — viewing stays open
A disabled `<button>` does not fire its own `onClick`, so a click on the locked CTA bubbles to the card body, which opens the product detail drawer. This is intentional and desirable: "view-only" means shoppers *should* be able to open details to look. The enforced guarantee is only that **nothing lands in the cart** (the RED test that asserted the drawer must not open was corrected to reflect this).

## Coverage & Known Gaps
- Full suite: **734 passed / 61 files** (`npx vitest run`). Typecheck clean (`npx tsc --noEmit`); build clean (`npm run build`).
- Not covered by automated tests (consistent with existing repo conventions):
  - The GroupBuyManager toggle UI (mirrors the untested Pasalo toggle panel).
  - `App.tsx` / `Menu.tsx` prop-threading (integration-level; covered by typecheck + card/drawer unit tests).
  - SQL RPC (no DB test harness in repo).

## Merge / RED-GREEN Summary
- `test: reproducers for group-buy view-only mode` — types + 6 RED tests (setViewOnlyMode missing, no "Coming soon" gating). RED validated: 6 failing / 23 passing across the 3 files.
- `feat: group-buy view-only mode (browse before launch)` — migration, hook setter, admin toggle, card/drawer gates, storefront wiring. GREEN: 734 passing, tsc clean, build clean.

## Follow-up
- **Migration not yet applied to the remote Supabase project.** The feature is inert until `20260718000000_group_buy_view_only_mode.sql` runs. Apply via `supabase db push` / MCP `apply_migration` before releasing.
