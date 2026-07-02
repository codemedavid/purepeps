# TDD Evidence — Per-Batch "Pasalo Mode" Storefront Filter

**Source plan:** conversational `/ecc:plan` output (this session). No `*.plan.md` file.
**Date:** 2026-07-03

## User Journeys
1. As an admin, I want to toggle "Pasalo mode" on the open group-buy batch, so that during a re-opening phase the storefront shows only items that still need orders.
2. As a shopper, when Pasalo mode is on I want to see only capped products that still have remaining slots, so I'm not distracted by unlimited or already-full items.
3. As a shopper, when no batch is open or the flag is off, I want the full catalog (no empty/broken storefront).

## Task Report
| Task | Summary | Validation | RED → GREEN | Guarantee |
|---|---|---|---|---|
| Pure filter util | `isPasaloEligible` + `filterPasaloProducts` in `src/utils/groupBuy.ts`, reusing `remainingForProduct`/`findProgressItem` | `npx vitest run src/utils/groupBuy.test.ts` | 7 failed (`is not a function`) → 44 passed | Only capped-with-remaining products survive the filter; input not mutated |
| DB migration | `group_buy_batches.pasalo_mode` column, `set_group_buy_pasalo_mode` RPC, `get_group_buy_progress` emits `pasalo_mode` | `npm run build` (type surface) | n/a (SQL) | Flag persists per batch; storefront RPC carries it |
| Types | `GroupBuyBatch.pasalo_mode` + progress `batch` Pick | `npm run build` | n/a | Type-safe flag end to end |
| Admin toggle | `useGroupBuy.setPasaloMode` + GroupBuyManager caps-tab switch (open batch only) | `npm run build` | n/a | Admin can flip the flag; guarded by `is_admin()` RPC |
| Storefront wire | `App.tsx` gates on `isBatchOpen` + flag, full-catalog fallback | `npm run build` | n/a | No open batch / flag off / loading → full catalog |

## Test Specification
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Capped product with remaining is pasalo-eligible | `groupBuy.test.ts:isPasaloEligible > is true for a capped product with remaining capacity` | unit | PASS |
| 2 | Uncapped product is not eligible | `isPasaloEligible > is false for an uncapped (unlimited) product` | unit | PASS |
| 3 | Full capped product is not eligible (incl. over-cap) | `isPasaloEligible > is false for a capped product that is full` | unit | PASS |
| 4 | Missing progress item → not eligible | `isPasaloEligible > is false when there is no progress item` | unit | PASS |
| 5 | Filter keeps only capped-with-remaining | `filterPasaloProducts > keeps only capped products that still have remaining slots` | unit | PASS |
| 6 | No progress data (no open batch) → empty list | `filterPasaloProducts > returns an empty list when there is no progress data` | unit | PASS |
| 7 | Filter does not mutate its input | `filterPasaloProducts > does not mutate the input product array` | unit | PASS |

## Coverage & Known Gaps
- Full suite: **535 passed / 46 files** (`npx vitest run`). Build/typecheck: clean (`npm run build`).
- Pure filter logic is fully unit-covered. Not covered by automated tests (consistent with existing repo conventions):
  - The GroupBuyManager toggle UI (no component test added; mirrors other untested admin panels).
  - `App.tsx` gating wiring (integration-level; verified by typecheck + manual).
  - SQL RPCs (no DB test harness in repo).

## Merge / RED-GREEN Summary
- `feat: add pasalo-mode product filter util (RED->GREEN)` — util + tests (RED evidence: 7 failing; GREEN: 44 passing).
- `feat: per-batch pasalo mode filters storefront to capped-with-remaining products` — migration, types, admin toggle, storefront wiring (GREEN: 535 passing, build clean).

## Follow-up
- **Migration not yet applied to the remote Supabase project.** The feature is inert until `20260703000000_group_buy_pasalo_mode.sql` runs. Apply via `supabase db push` / MCP `apply_migration` before releasing.
