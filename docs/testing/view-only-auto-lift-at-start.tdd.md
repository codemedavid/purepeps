# TDD evidence — view-only mode auto-lifts at the announced start

## Source plan

No `*.plan.md`. Journeys were derived during this TDD run, from a live diagnosis:
every product on the storefront was showing "Coming soon".

**Diagnosis.** The public `get_group_buy_progress` RPC returned, for the open
batch `Gb 5` (batch #28):

```json
{ "status": "open", "starts_at": "2026-07-27", "ends_at": "2026-08-02",
  "view_only_mode": true, "pasalo_mode": true }
```

`src/App.tsx` gated `isViewOnly` on `batch.view_only_mode` alone, and
`MenuItemCard`/`ProductDetailModal` render the CTA as "Coming soon" whenever that
is true — so the storefront was behaving as written. The defect is that
view-only is documented as a **pre-launch** phase but had no link to the batch's
announced start: the gate stayed up on Aug 1 for a drop announced to go live on
Jul 27, and only an admin toggle could clear it.

## User journeys

1. As a shopper, I want a batch's products to become orderable once the announced
   start date arrives, so a forgotten pre-launch toggle does not keep the whole
   catalog stuck on "Coming soon".
2. As an admin, I want view-only to stay fully manual on a batch with no announced
   start, so the toggle still works as a plain on/off switch.
3. As a shopper with the page already open, I want the gate to lift without a
   manual reload when the start time passes.

## Task report

### Task 1 — view-only is bounded by the announced start

- **Execution:** added `isViewOnlyActive(batch, now)` to
  `src/utils/groupBuySchedule.ts` — true only while `view_only_mode` is on AND
  (`starts_at` is absent OR `now < starts_at`) — and switched `src/App.tsx` to it.
- **Validation command:** `npm test -- groupBuySchedule`
- **RED:**
  ```
  FAIL src/utils/groupBuySchedule.test.ts > isViewOnlyActive > ...
  TypeError: isViewOnlyActive is not a function
  Tests  7 failed | 14 passed (21)
  ```
- **GREEN:**
  ```
  Test Files  1 passed (1)
       Tests  21 passed (21)
  ```
- **Guaranteed:** the gate lifts at and after `starts_at`, holds before it, holds
  with a null or unparseable `starts_at`, and is inert when the flag is off or
  there is no batch.

### Task 2 — an already-open page lifts the gate on its own

- **Execution:** `src/App.tsx` ticks a `now` clock every 30s (`VIEW_ONLY_TICK_MS`)
  while — and only while — a view-only gate with an announced start is pending.
- **Validation command:** `npm run build`
- **Output:** `✓ built in 3.47s`
- **Not covered by an automated test.** See known gaps.

### Task 3 — admin copy matches the behavior

- **Execution:** the View-only toggle blurb in `src/components/GroupBuyManager.tsx`
  now states that it also lifts itself once the announced start passes.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | A flag-off batch is never gated | `src/utils/groupBuySchedule.test.ts:is inactive when the batch is not in view-only mode` | unit | PASS | `npm test -- groupBuySchedule` |
| 2 | A missing batch is never gated | `…:is inactive when there is no batch` | unit | PASS | `npm test -- groupBuySchedule` |
| 3 | The storefront is gated before the announced start | `…:gates the storefront before the announced start` | unit | PASS | `npm test -- groupBuySchedule` |
| 4 | The gate lifts once the announced start has passed | `…:lifts itself once the announced start has passed` | unit | PASS | `npm test -- groupBuySchedule` |
| 5 | The gate lifts exactly at the start instant (boundary) | `…:lifts itself exactly at the announced start instant` | unit | PASS | `npm test -- groupBuySchedule` |
| 6 | With no announced start the toggle stays fully manual | `…:stays gated with no announced start, so the toggle remains fully manual` | unit | PASS | `npm test -- groupBuySchedule` |
| 7 | An unparseable start date fails safe (stays gated) | `…:stays gated when the announced start is unparseable` | unit | PASS | `npm test -- groupBuySchedule` |

## Coverage and known gaps

- Full suite: `npm test` → **784 passed**, 2 suites failed to load. Both failures
  are **pre-existing and unrelated**: `src/hooks/useReturningCustomer.test.ts` and
  `src/utils/checkoutPrefill.test.ts` import source modules that do not exist in
  the repo.
- `npm run test:coverage` is **not available** — the project defines no coverage
  script and no vitest coverage provider is installed. No coverage number was
  produced, so the 80% threshold is unverified for this change.
- `npm run lint` is **broken repo-wide** (`@typescript-eslint/no-unused-expressions`
  fails to load under the installed ESLint version) — not introduced here.
- `npx tsc -b --noEmit` reports pre-existing errors elsewhere (AdminDashboard,
  several `.test.tsx` files); **none in the three files changed here**, and
  `npm run build` succeeds.
- The 30s clock tick in `App.tsx` (Task 2) has no automated test — `App.tsx` has no
  test harness in this repo. The pure predicate it feeds is fully covered.
- **Not changed:** the live DB still has `view_only_mode = true` and
  `pasalo_mode = true` on batch #28. With this fix the view-only gate no longer
  applies (its `starts_at` of Jul 27 has passed), but pasalo mode still filters the
  catalog to capped products with slots remaining; clearing that is an admin toggle.

## Merge evidence

- RED: `7a6b3af` test: reproducer for view-only mode not lifting at the announced start
- GREEN: `cf25f15` fix: view-only mode lifts itself once the batch's announced start passes
- Refactor: none needed — the fix is one pure predicate plus its call sites.
