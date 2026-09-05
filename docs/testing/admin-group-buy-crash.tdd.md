# TDD evidence — admin Group Buy screen crashed on open

**Branch:** `feat/gb-landing-homepage`
**Source plan:** none. The journeys below were derived during this TDD run from a
client report relayed verbatim as: "when in admin dashboard when clicking the
groupbuy or something the cient send that its not working."

The report named no error text and no batch, so the first step was reproduction,
not a fix. `npx tsc --noEmit -p tsconfig.app.json` pointed straight at the cause:

```
src/components/GroupBuyManager.tsx(86,42): error TS2448: Block-scoped variable 'selectedBatch' used before its declaration.
src/components/GroupBuyManager.tsx(86,42): error TS2454: Variable 'selectedBatch' is used before being assigned.
```

## The defect

`GroupBuyManager` called `useKitAllocation(selectedBatch?.id ?? null)` on line 86,
but `selectedBatch` was not declared until the `useMemo` on line 107. Reading a
`const` above its declaration is a temporal-dead-zone access, so the component
threw `ReferenceError: Cannot access 'selectedBatch' before initialization` on its
**first** render — every time, for every admin, regardless of data.

`/admin` sits inside the single app-wide `ErrorBoundary` (`src/App.tsx:401-418`),
so the throw replaced the whole dashboard with the generic fallback:
"Something went wrong — This page failed to load. Refreshing usually fixes it."
Refreshing did not fix it: the crash is deterministic, not transient.

Introduced in `bce5d31` (2026-08-24) "feat: wire Ligwak into the admin dashboard
and order history", which added the kit-allocation hook above the declaration it
depends on. The Group Buy tile has been dead since that commit. Nothing caught it
because `GroupBuyManager` had no test, and a bare `tsc --noEmit` exits 0 while
checking zero files — the `-p tsconfig.app.json` project flag is required.

## User journeys

1. As an admin, I want to click "Group Buy" on the dashboard and land on the
   Group Buy screen, so I can manage batches at all.
2. As an admin with no batches opened yet, I want that screen to render its empty
   state rather than crash, so a fresh install is usable.
3. As an admin with an open batch, I want the kit-allocation panel bound to the
   batch actually in view, not to `null`.

## Task report

### Reproduce the crash (RED)

Added `src/components/GroupBuyManager.test.tsx`, mounting `GroupBuyManager` with
all seven of its data hooks stubbed — this suite is about the screen mounting,
not about what Supabase returns.

- **Command:** `npx vitest run src/components/GroupBuyManager.test.tsx`
- **Result:** 3 failed / 3.

```
ReferenceError: Cannot access 'selectedBatch' before initialization
 ❯ GroupBuyManager src/components/GroupBuyManager.tsx:86:42
     86|   const kitAllocation = useKitAllocation(selectedBatch?.id ?? null);
       |                                          ^
```

The failure is the intended business-logic defect, not a setup or syntax error:
the stack lands on the exact production line the typechecker flagged.

Checkpoint: `04dec8c test: add reproducer for the admin Group Buy screen crash`.

### Apply the fix (GREEN)

Moved the `useKitAllocation` call below the `selectedBatch` memo, with a comment
recording why it must stay there. Hook call order remains constant across
renders, so React's rules of hooks are unaffected.

- **Command:** `npx vitest run src/components/GroupBuyManager.test.tsx`
- **Result:** 3 passed / 3, 1.87s.

Checkpoint: `40d972f fix: stop the admin Group Buy screen crashing on open`.

### Re-verify RED against the final test (fixture correction)

The first GREEN attempt hung, spinning a worker at 87% CPU. The cause was in the
new test, not the product: the stubs returned fresh array/object literals on every
render, while the live hooks hold theirs in `useState`. Once the screen could
render at all, the cap-drafts effect saw a changed `progress.items` identity every
render and re-fired forever. The stubs were changed to return stable
module-level constants.

Because the fixture changed after the original RED run, RED was re-verified
against the test as it now stands, with the one-line fix stashed:

- **Command:** `git stash push -- src/components/GroupBuyManager.tsx && npx vitest run src/components/GroupBuyManager.test.tsx`
- **Result:** exit 1 — `ReferenceError: Cannot access 'selectedBatch' before initialization at GroupBuyManager (.../GroupBuyManager.tsx:86:42)`, then `git stash pop`.

### Typecheck

- **Command:** `npx tsc --noEmit -p tsconfig.app.json`
- **Result:** no errors reported in `GroupBuyManager.tsx` — TS2448 and TS2454 are
  gone. Pre-existing errors elsewhere in the project (`AdminDashboard.tsx`
  protocol payloads, several `*.test.tsx` fixtures) are untouched and out of
  scope for this fix.

### Full suite

- **Command:** `npx vitest run`
- **Result:** `Test Files 2 failed | 136 passed (138)`, `Tests 1753 passed (1753)`.

Zero test failures. The two failing *files* are the known pre-existing orphans,
`src/hooks/useReturningCustomer.test.ts` and `src/utils/checkoutPrefill.test.ts`,
which fail at collection because the modules they import do not exist. They are
unrelated to this change.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | The Group Buy screen renders its heading and Back control when an admin opens it with no batches yet | `src/components/GroupBuyManager.test.tsx:renders the Group Buy screen when an admin opens it with no batches yet` | component | PASS | `npx vitest run src/components/GroupBuyManager.test.tsx` |
| 2 | The Group Buy screen renders when a batch is open | `src/components/GroupBuyManager.test.tsx:renders the Group Buy screen when a batch is open` | component | PASS | same command |
| 3 | The kit allocation is subscribed to the batch in view, not to `null` — so a "fix" that merely silences the TDZ by passing `null` still fails | `src/components/GroupBuyManager.test.tsx:subscribes the kit allocation to the batch in view, not to null` | component | PASS | same command |

## Coverage and known gaps

No coverage command is configured in `package.json` (`test` is `vitest run`; there
is no `test:coverage` script and no coverage provider installed), so no percentage
is reported here rather than inventing one.

Deliberate gaps:

- The suite proves the screen **mounts**; it does not exercise the Group Buy tabs
  (orders, members, caps, ligwak), batch lifecycle actions, or kit allocation
  behaviour. Those paths were already crash-blocked and remain untested at this
  level; the existing `src/components/groupbuy/*.test.tsx` files cover the child
  panels in isolation.
- Not verified in a real browser. The fix was verified by the typechecker and by
  a jsdom render, both of which reproduce the exact `ReferenceError` the browser
  would raise. A click-through of `/admin` → Group Buy against the running app is
  the recommended confirmation before the client is told it is fixed.
- The two orphaned test files are left as found; deleting or repairing them is
  separate work.

## Merge evidence

If these checkpoints are squashed, this is the summary to carry into the PR body:

- **RED** — `npx vitest run src/components/GroupBuyManager.test.tsx`: 3 failed,
  `ReferenceError: Cannot access 'selectedBatch' before initialization` at
  `GroupBuyManager.tsx:86:42`. Re-confirmed against the final test with the fix
  stashed.
- **GREEN** — same command: 3 passed. Full suite `npx vitest run`: 1753 tests
  passed, 0 test failures (2 pre-existing orphan files still fail to collect).
  `npx tsc --noEmit -p tsconfig.app.json`: TS2448/TS2454 cleared from this file.
- **Refactor** — none beyond the fix itself. The change is one relocated line
  plus a comment; there was nothing to clean up afterwards.
