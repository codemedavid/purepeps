# TDD Evidence — Reopen the latest closed group buy

## Source plan

No `*.plan.md` was supplied. User journeys were derived during this TDD run from
the request: _"allow me to reopen a closed group buy but only the latest group
buy available."_

## User journeys

1. As an admin, I want to reopen a **closed** group buy so I can take new orders
   again after archiving a batch too early.
2. As an admin, I must **not** be able to reopen an old closed batch once a newer
   batch exists — only the **latest** batch (highest `batch_number`) can be
   revived, so batch history stays trustworthy.

## Design

Four layers, the "latest only" rule single-sourced in a pure helper and enforced
authoritatively by the RPC:

| Layer | File | Role |
|-------|------|------|
| Pure rule | `src/utils/groupBuy.ts` — `isLatestBatch`, `canReopenClosedBatch` | Single source of the "latest only" logic (UI-facing) |
| UI | `src/components/groupbuy/BatchLifecycleBar.tsx` | Renders **Reopen** on a closed batch when eligible, routed through the confirm dialog |
| Wiring | `BatchOverviewTab.tsx`, `GroupBuyManager.tsx` | Threads the computed flag down |
| Server (authoritative) | `supabase/migrations/20260716000000_reopen_latest_closed_batch.sql` | `reopen_group_buy_batch` now accepts `closed`, but only for the max-`batch_number` batch |

## Task report

### Task 1 — Pure "latest only" rule (RED → GREEN)

- Added `isLatestBatch` / `canReopenClosedBatch` tests to `src/utils/groupBuy.test.ts`.
- **RED:** `npx vitest run src/utils/groupBuy.test.ts` → `7 failed | 44 passed`,
  `TypeError: canReopenClosedBatch is not a function`.
- Implemented both helpers in `src/utils/groupBuy.ts`.
- **GREEN:** `npx vitest run src/utils/groupBuy.test.ts` → `51 passed`.
- **Guarantees:** latest batch = highest `batch_number`; empty list has no latest;
  a closed batch is reopenable only when it is the latest; non-closed statuses
  return false from this rule.

### Task 2 — Reopen button on a closed batch (RED → GREEN)

- Added two tests to `BatchLifecycleBar.test.tsx` (offers Reopen when eligible +
  routes through `requestConfirm`; hides Reopen when not the latest).
- **RED:** `npx vitest run src/components/groupbuy/BatchLifecycleBar.test.tsx` →
  `1 failed | 4 passed` (no Reopen button rendered for a closed batch).
- Added the `canReopenClosed` prop and a Reopen button in the `closed` branch.
- **GREEN:** same command → `5 passed`.
- **Guarantees:** a closed+latest batch shows Reopen and fires `onReopen(id)` only
  after the shared confirm dialog is accepted; a closed non-latest batch shows no
  Reopen button but keeps the "Open a Batch" escape hatch.

### Task 3 — Wiring + server enforcement

- `BatchOverviewTab` forwards `canReopenClosed`; `GroupBuyManager` computes it via
  `canReopenClosedBatch(selectedBatch, batches)`.
- New migration extends `reopen_group_buy_batch` to accept `closed` only when the
  target's `batch_number` equals `MAX(batch_number)`; the one-open-batch guard is
  unchanged.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | `isLatestBatch` is true only for the highest `batch_number`; false for empty list | `src/utils/groupBuy.test.ts:isLatestBatch` | unit | PASS | `npx vitest run src/utils/groupBuy.test.ts` |
| 2 | `canReopenClosedBatch` allows only a closed + latest batch | `src/utils/groupBuy.test.ts:canReopenClosedBatch` | unit | PASS | same |
| 3 | Reopen shown on latest closed batch, routed through confirm → `onReopen(id)` | `BatchLifecycleBar.test.tsx:offers Reopen on the latest closed batch` | component | PASS | `npx vitest run src/components/groupbuy/BatchLifecycleBar.test.tsx` |
| 4 | Reopen hidden on a closed non-latest batch; Open a Batch still shown | `BatchLifecycleBar.test.tsx:hides Reopen on a closed batch that is not the latest` | component | PASS | same |

## Coverage and known gaps

- Full suite: `npx vitest run` → **642 passed (56 files)**.
- Typecheck: `npx tsc --noEmit -p tsconfig.app.json` — the 12 `selected_sticker_id`
  errors are **pre-existing** on a clean tree (verified via `git stash`); this
  change introduces **no** new type errors.
- **Gap — SQL RPC not unit-tested:** the repo has no pgTAP/DB test harness, so
  `reopen_group_buy_batch` is verified by code review only. It is the authoritative
  backstop; the client helper mirrors its rule. Manual verification: apply the
  migration, close the latest batch, confirm Reopen succeeds; attempt to reopen an
  older closed batch (via direct RPC) and confirm it raises
  `Only the latest batch can be reopened once closed.`

## Merge evidence

RED → GREEN summary (copy into PR/squash body if squashing):
- Task 1: RED `7 failed` (missing helper) → GREEN `51 passed`.
- Task 2: RED `1 failed` (no Reopen button) → GREEN `5 passed`.
- Regression: full suite `642 passed`; no new tsc errors.
