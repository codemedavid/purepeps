# TDD Evidence — Edit Group Buy Settings

**Feature:** Let an admin edit an open group-buy batch's **name**, **announced dates**, and **available access tiers** from the Group Buy dashboard, without reopening the batch (so members keep their paid access).

**Source plan:** No `*.plan.md`; journeys derived during this TDD run from the user request.

## User journeys

1. As an admin, I want to rename the open batch so the storefront hero shows the correct drop name.
2. As an admin, I want to adjust the announced start/finish dates so the member countdown is accurate.
3. As an admin, I want to choose which access tiers the open batch offers so I can add/remove tiers without forcing members to re-pay.
4. As an admin, I want bad date ranges (finish ≤ start) blocked before they are saved.

## Scope decisions (confirmed with user)

- Editable on the **open batch only** (tiers/dates have no effect once buying stops).
- Entry point: an **"Edit settings"** button on the Overview tab, beside the lifecycle bar.
- Name persists via a direct admin `UPDATE` on `group_buy_batches` (mirrors `setFulfillmentStage`); dates reuse the existing `set_group_buy_schedule` RPC; tiers reuse the existing `set_batch_tiers` RPC. **No new SQL migration required.**

## Task report

| Behavior | Validation command | RED → GREEN |
|---|---|---|
| `EditBatchModal` seeds + submits name/dates/tiers, blocks bad dates | `npx vitest run src/components/groupbuy/EditBatchModal.test.tsx` | RED: `Failed to resolve import './EditBatchModal'` → GREEN: 8/8 pass |
| `useGroupBuy.fetchBatchTierIds / fetchOfferableTiers / updateBatchSettings` issue correct table/RPC calls | `npx vitest run src/hooks/useGroupBuy.test.ts` | RED: `updateBatchSettings is not a function` → GREEN: 6 new + 3 existing pass |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Modal renders nothing when closed | `EditBatchModal.test.tsx` | unit (RTL) | PASS |
| 2 | Modal pre-fills current name, dates (YYYY-MM-DD), and ticks offered tiers | `EditBatchModal.test.tsx` | unit | PASS |
| 3 | Submits trimmed name, dates, and tier ids | `EditBatchModal.test.tsx` | unit | PASS |
| 4 | Newly-ticked tier is included in the submitted selection | `EditBatchModal.test.tsx` | unit | PASS |
| 5 | Cleared name submits as `null` | `EditBatchModal.test.tsx` | unit | PASS |
| 6 | Submit blocked + error shown when finish ≤ start | `EditBatchModal.test.tsx` | unit | PASS |
| 7 | Cancel button invokes `onCancel` | `EditBatchModal.test.tsx` | unit | PASS |
| 8 | `fetchBatchTierIds` selects `tier_id` from `batch_tiers` for the batch | `useGroupBuy.test.ts` | unit (hook) | PASS |
| 9 | `fetchOfferableTiers` reads active tiers ordered by `sort_order` | `useGroupBuy.test.ts` | unit | PASS |
| 10 | `updateBatchSettings` writes name UPDATE + `set_group_buy_schedule` + `set_batch_tiers` | `useGroupBuy.test.ts` | unit | PASS |
| 11 | `updateBatchSettings` stores a blank name as `null` | `useGroupBuy.test.ts` | unit | PASS |

## Verification

- `npx vitest run` → **41 files, 446 tests, all passing**.
- `npx tsc -p tsconfig.app.json --noEmit` → the four changed source files (`EditBatchModal.tsx`, `useGroupBuy.ts`, `GroupBuyManager.tsx`, `BatchOverviewTab.tsx`) and `EditBatchModal.test.tsx` produce **no errors**. Remaining tsc output is all pre-existing and unrelated (AdminDashboard/Protocol type, OrderTracking, several `BatchOrder` test fixtures missing `selected_sticker_id`, and the existing `useGroupBuy.test.ts` mock-stub typing at lines 10/28/29 — none in this diff).

## Known gaps

- ESLint cannot run in this repo (a `@typescript-eslint/no-unused-expressions` rule-schema crash predating this change) — not addressed here.
- No E2E (Playwright) coverage added; the dashboard wiring is exercised only through unit tests of the modal + hook.
