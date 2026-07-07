# TDD Evidence — Surface the real reason when adding products to an order fails

## Source plan
No `*.plan.md` was provided. Journeys were derived during this TDD run from the
user's report: "when editing an order and adding products, it sometimes fails
with only *Action failed* — the real reason is usually the batch cap. Surface the
exact reason."

## User journeys
- As an admin editing a group-buy order, when I add products that exceed the
  batch cap, I want to see the exact cap reason (cap / already reserved /
  requested) so I know why the save was rejected — not a generic "Action failed".
- As an admin, when any group-buy action fails at the database level, I want the
  database's own message surfaced instead of a generic fallback.

## Root cause
The Postgres trigger `enforce_group_buy_on_order()`
(`supabase/migrations/20260716000000_group_buy_variation_caps.sql:163`) already
raises a precise message:

> Group buy limit reached for one of the items in your order (cap 50, already reserved 45, you requested 10).

But `GroupBuyManager.runAction` did:

```ts
setActionError(err instanceof Error ? err.message : 'Action failed');
```

Supabase's `PostgrestError` is a **plain object** (`{ message, details, hint, code }`),
**not** an `instanceof Error`. So the branch fell through to the generic
`'Action failed'` and the real message was thrown away. Every DB-level failure in
the group-buy admin (add product, edit items, set cap, confirm, etc.) was affected.

## Task report

### 1. Extract a real message from Supabase/Postgrest errors
- **Summary:** Added `getActionErrorMessage(error, fallback)` that reads `.message`
  from `Error` instances, stitches `message`/`details`/`hint` from plain error
  objects (de-duplicated), passes through non-empty strings, and falls back only
  when nothing usable exists.
- **Command:** `npx vitest run src/utils/errorMessage.test.ts`
- **RED:** `Failed to resolve import "./errorMessage"` — the test referenced the
  not-yet-created util (compile-time RED, exercising the intended code path).
- **GREEN:** `Test Files 1 passed (1) · Tests 8 passed (8)`.
- **Guarantees:** cap-rejection `PostgrestError` objects yield their full message;
  hints are appended; duplicate details are not repeated; null/undefined/empty
  objects and message-less Errors use the fallback.

### 2. Wire the util into the admin error banner
- **Summary:** `GroupBuyManager.runAction` now calls `getActionErrorMessage(err)`.
  This covers the add-products path — both `saveItems` (edit existing lines) and
  `addLinkedOrder` (new products → new linked order) throw through `runAction`.
- **Command:** `npx tsc --noEmit` → exit 0; `npx vitest run` → all pass.
- **Guarantees:** the cap-trigger message now reaches the on-screen error banner.

## Test specification

| # | What is guaranteed | Test file / command | Test type | Result | Evidence |
|---|--------------------|---------------------|-----------|--------|----------|
| 1 | A real `Error` yields its own message | `src/utils/errorMessage.test.ts` | unit | PASS | `npx vitest run src/utils/errorMessage.test.ts` |
| 2 | A Supabase cap-rejection plain object yields its full message | `src/utils/errorMessage.test.ts` | unit | PASS | same |
| 3 | A distinct `hint` is appended to the message | `src/utils/errorMessage.test.ts` | unit | PASS | same |
| 4 | Repeated `details` is not duplicated | `src/utils/errorMessage.test.ts` | unit | PASS | same |
| 5 | Non-empty strings pass through | `src/utils/errorMessage.test.ts` | unit | PASS | same |
| 6 | null / undefined / `{}` use the fallback | `src/utils/errorMessage.test.ts` | unit | PASS | same |
| 7 | A message-less `Error` uses the fallback | `src/utils/errorMessage.test.ts` | unit | PASS | same |
| 8 | A caller-provided fallback is honored | `src/utils/errorMessage.test.ts` | unit | PASS | same |

## Coverage and known gaps
- Full suite: **62 files, 748 tests passing** (`npx vitest run`). Type check clean
  (`npx tsc --noEmit`, exit 0).
- `npx eslint` currently crashes for **all** files with a pre-existing
  `@typescript-eslint/no-unused-expressions` / `allowShortCircuit` plugin-version
  error — unrelated to this change (reproduces on untouched `src/utils/currency.ts`).
- Not changed: the trigger message names "one of the items", not the specific
  product. Surfacing the exact product name would require a DB migration and is a
  separate follow-up; this change surfaces the message the DB already produces.
