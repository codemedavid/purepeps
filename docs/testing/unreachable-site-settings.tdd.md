# TDD Evidence — Unreachable Site Settings screen (timeline editor had no entry point)

## Source plan

No `*.plan.md` was supplied. The journey was derived during this run from the
client's report: the admin dashboard's Quick Actions list showed 18 tiles and no
**Settings**, so the answer "Admin → Settings → Group Buy Landing" was not
actually followable.

## User journeys

1. As an admin, I want a **Settings** entry on the dashboard, so I can reach the
   Site Settings screen at all.
2. As an admin, I want that entry to open the **Group Buy Landing** editor, so I
   can change the homepage timeline stages and dates.

## Root cause

`AdminDashboard.tsx` declared `'settings'` in the `currentView` union (line 43)
and rendered `<SiteSettingsManager />` for it (line ~1397), but **nothing in the
codebase ever called `setCurrentView('settings')`**. Verified by search:

```
$ grep -rn "'settings'" src/ --include="*.tsx" --include="*.ts" \
    | grep -v "site_settings\|siteSettings\|SiteSettings\|test"
src/components/AdminDashboard.tsx:43:   ... | 'settings' | ...   # the type union
src/components/AdminDashboard.tsx:1397: if (currentView === 'settings') {   # the render branch
```

Two references, neither a navigation. The screen — Site Settings, the
access-intake switch, the storefront notice editor and `GbLandingManager` (the
homepage timeline editor) — was dead code from the user's point of view.

## Task report

### Task 1 — Reproduce the missing entry point

- **Summary:** New `src/components/AdminDashboard.test.tsx` stubs every data hook
  and asserts an admin can find a Settings quick action and open the GB Landing
  editor through it.
- **Validation command:** `npx vitest run src/components/AdminDashboard.test.tsx`
- **RED:**
  `Unable to find an accessible element with the role "button" and name /Settings/i`
  — 2 failed, 0 passed. The dashboard itself mounted (the rendered DOM in the
  failure output contains "Total Products"), so the failure was the missing tile
  and not broken test setup.
- **Note on the stubs:** hook stubs return module-level constants
  (`NO_PRODUCTS`, `SITE_SETTINGS`, …). Fresh literals per render make dependency
  arrays look changed and hang the worker instead of failing — the repo has hit
  this before in `GroupBuyManager.test.tsx`.

### Task 2 — Add the Settings quick action

- **Summary:** Added the tile to the Quick Actions grid after Protocols, calling
  `setCurrentView('settings')`. The lucide `Settings` icon is imported as
  `SettingsIcon` so it cannot be mistaken for the view name.
- **Validation command:** `npx vitest run src/components/AdminDashboard.test.tsx`
- **GREEN:** `Test Files 1 passed (1) / Tests 2 passed (2)`.

## Test specification

| # | What is guaranteed | Test file | Test type | Result | Evidence |
|---|--------------------|-----------|-----------|--------|----------|
| 1 | The admin dashboard offers a Settings quick action | `src/components/AdminDashboard.test.tsx:offers a Settings quick action` | unit | PASS | `npx vitest run src/components/AdminDashboard.test.tsx` |
| 2 | Clicking it opens the Group Buy Landing editor, including the Stage 1 date field | `src/components/AdminDashboard.test.tsx:opens the Group Buy Landing editor from the Settings quick action` | unit | PASS | `npx vitest run src/components/AdminDashboard.test.tsx` |

## Regression and typecheck status

- **Full suite:** `npx vitest run` → **1765 tests passed, 0 test failures**;
  137/139 files passed. The 2 failing FILES are the pre-existing orphans
  (`src/utils/checkoutPrefill.test.ts` imports a module that no longer exists),
  unrelated to this change.
- **Typecheck:** `npx tsc --noEmit -p tsconfig.app.json` → **99 error lines both
  with and without this change** (verified by stashing). The three
  `AdminDashboard.tsx` errors (lines 49, 347, 405) are the pre-existing
  `protocols` / `generateProtocolFromTemplate` typing issues, untouched here.

## Known gaps

- No refactor commit: the fix is one JSX tile, and the surrounding Quick Actions
  grid is 18 hand-written buttons. Extracting that grid into a data-driven list
  would be a worthwhile follow-up but is out of scope for restoring the entry
  point.
- `SiteSettingsManager` still has no back button to the dashboard (there is a
  stale comment block about this at `AdminDashboard.tsx:1398-1413`). Reaching the
  screen is fixed; leaving it still relies on the surrounding chrome.
