# TDD Evidence — Default group-buy access tiers to the server default

## Source plan

No `*.plan.md`. Journeys derived from the request: *"for the access tier on the group
buy we want to default it to the server default. Don't add the price anymore"* —
clarified as: the Open Batch form should not ask the admin to pick tiers or enter
prices; tiers default to the server's active set, each at its own (Access Tiers) price.

## User journeys

- As an admin, when I open a group-buy batch, I want it to automatically offer every
  active access tier at its own price, so I don't have to pick tiers or type prices.
- As a member, I still see the same purchasable tiers (and their prices) on the open
  batch, because the server links all active tiers by default.

## Task report

### 1. Open Batch form drops the tier picker and prices
- Summary: Removed the tier-selection list, price display, `useTierLibrary`, and the
  `tierIds` field from `OpenBatchValues`. The form now collects name + announced dates
  only, with a note that all active tiers are offered.
- Validation: `npx vitest run src/components/groupbuy/OpenBatchModal.test.tsx`
- RED: 3 failing (picker/price still rendered; submit still included `tierIds`).
- GREEN: 7 passing.
- Guarantees: no tier picker / price shown; submit payload is `{ name, startsAt, endsAt }`;
  date-order validation preserved.

### 2. Hook opens batches with the server default tier set
- Summary: `useGroupBuy.openBatch(name?, startsAt?, endsAt?)` always calls
  `open_group_buy_batch` with `p_tier_ids: null` (and no per-batch access fee).
- Validation: `npx vitest run src/hooks/useGroupBuy.test.ts`
- RED → GREEN: new test asserts the RPC payload is `{ p_name, p_starts_at, p_ends_at, p_tier_ids: null }`.
- Guarantees: the open flow never sends tier/price overrides.

### 3. Server defaults a NULL selection to all active tiers
- Summary: Migration `20260704000000_open_batch_default_tiers.sql` updates
  `open_group_buy_batch` so `p_tier_ids IS NULL` links every active tier to the new
  batch (previously NULL left the batch with no tiers / locked checkout). An explicit
  list still wins.
- Validation: SQL not unit-tested in this repo (no DB test harness). Verified by review
  against the existing `per_batch_tiers` migration and `get_access_tiers` join.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Open form shows no tier picker or price | `OpenBatchModal.test.tsx: does not ask the admin to pick tiers or prices` | unit | PASS |
| 2 | Submit payload omits tier ids | `OpenBatchModal.test.tsx: submits a trimmed name ... without tier ids` | unit | PASS |
| 3 | Date-order validation preserved | `OpenBatchModal.test.tsx: blocks submit when the finish date is not after the start date` | unit | PASS |
| 4 | openBatch sends `p_tier_ids: null` | `useGroupBuy.test.ts: opens a batch with null tier ids ...` | unit | PASS |

## Coverage and known gaps

- Full suite: `npx vitest run` → 40 files, 427 tests, all PASS. `tsc --noEmit` clean.
- Removed dead hook `src/hooks/useTierLibrary.ts` (only the old picker used it).
- Gap: the SQL default-all-active behavior has no automated DB test (repo has none);
  covered by review only.
- Note: project `eslint` currently crashes loading `@typescript-eslint/no-unused-expressions`
  (pre-existing tooling version mismatch, unrelated to this change).
