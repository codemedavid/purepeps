# TDD Evidence — Reopen any closed group buy (one open at a time)

## Source plan

No `*.plan.md` was supplied. Journeys were derived during this TDD run from the
request: _"I want to allow all batches to be able to reopen but only 1 should be
open at a time."_ This **supersedes** the earlier "latest only" rule
(`reopen-latest-closed-group-buy.tdd.md`).

## User journeys

1. As an admin, I want to reopen **any** closed group buy — including an old one —
   so I can revive a past batch when needed.
2. As an admin, only **one** batch may be open at a time, so reopening is blocked
   while another batch already holds the open slot.

## Design

The change is a generalization of the previous feature: drop the "latest only"
restriction, keep the single-open constraint.

| Layer | File | Role |
|-------|------|------|
| Pure rule | `src/utils/groupBuy.ts` — `canReopenClosedBatch` | Closed AND no other batch open. `isLatestBatch` removed as dead code. |
| UI | `src/components/groupbuy/BatchLifecycleBar.tsx` | Reopen button on a closed batch when eligible (unchanged — takes the boolean flag) |
| Wiring | `BatchOverviewTab.tsx`, `GroupBuyManager.tsx` | Threads the computed flag (unchanged) |
| Server (authoritative) | `supabase/migrations/20260717000000_reopen_any_closed_batch.sql` | `reopen_group_buy_batch` accepts `closed` with no batch_number check; one-open guard retained |

## Task report

### Task 1 — Generalize the reopen rule (RED → GREEN)

- Rewrote `canReopenClosedBatch` tests in `src/utils/groupBuy.test.ts` for the new
  semantics; removed the obsolete `isLatestBatch` suite.
- **RED:** `npx vitest run src/utils/groupBuy.test.ts` → `1 failed | 48 passed`
  ("allows reopening any closed batch when no other batch is open" failed because
  the old impl still enforced latest-only).
- Replaced the helper: `status === 'closed' && no other batch is open`; deleted
  `isLatestBatch` + `NumberedBatch`.
- **GREEN:** same command → `49 passed`.
- **Guarantees:** any closed batch is reopenable when nothing else is open; an old
  closed batch qualifies; reopen is refused while another batch is open; non-closed
  statuses return false; a lone closed batch qualifies.

### Task 2 — Server enforcement

- New migration drops the `MAX(batch_number)` check from `reopen_group_buy_batch`
  while keeping the one-open guard and the admin check. Applied via Supabase MCP
  (`{"success":true}`).

### UI / wiring

- `BatchLifecycleBar` and its tests are unchanged — the component still consumes a
  `canReopenClosed` boolean; only the rule that computes it changed.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Any closed batch (even old) is reopenable when nothing else is open | `src/utils/groupBuy.test.ts:allows reopening any closed batch when no other batch is open` | unit | PASS | `npx vitest run src/utils/groupBuy.test.ts` |
| 2 | Reopen refused while another batch holds the open slot | `src/utils/groupBuy.test.ts:refuses when another batch already holds the single open slot` | unit | PASS | same |
| 3 | Non-closed batch is not reopenable via this rule | `src/utils/groupBuy.test.ts:refuses a batch that is not closed` | unit | PASS | same |
| 4 | Reopen button shows on an eligible closed batch, routed through confirm | `BatchLifecycleBar.test.tsx:offers Reopen on the latest closed batch` | component | PASS | `npx vitest run src/components/groupbuy/BatchLifecycleBar.test.tsx` |

## Coverage and known gaps

- Full suite: `npx vitest run` → **640 passed (56 files)**.
- Typecheck: no new errors in changed source files (pre-existing `selected_sticker_id`
  mock errors remain, verified earlier via `git stash`).
- **Gap — SQL RPC not unit-tested:** no pgTAP harness in the repo. The RPC is the
  authoritative backstop and mirrors the client rule. Manual check: close two
  batches, reopen the older one → succeeds; open a batch, then attempt to reopen a
  closed one → raises *"Another batch is already open…"*.

## Merge evidence

RED → GREEN: Task 1 RED `1 failed` (old closed batch rejected by latest-only) →
GREEN `49 passed`. Regression: full suite `640 passed`; no new tsc errors. Migration
applied via MCP.
