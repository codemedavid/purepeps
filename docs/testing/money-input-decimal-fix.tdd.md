# TDD Evidence: Product price inputs no longer force a decimal point

## Problem / user journey

> As a store admin, I want to type whole-peso prices in product management
> without being forced to add a decimal point, so that entering prices is fast
> and doesn't break when I type a decimal.

## Root cause

Product variation price fields (`VariationManager.tsx`) used
`type="number" step="0.01"` bound to a number via `parseFloat(e.target.value) || 0`.
That pattern forces decimal-oriented behavior and collapses an in-progress
entry like `1500.` back to `1500` on every keystroke, so the decimal point
could never be typed. The rest of the app prices in whole pesos.

## Fix

Introduced a reusable `MoneyInput` component (`src/components/MoneyInput.tsx`)
with its own text buffer. It accepts whole numbers naturally, preserves a
trailing `.` while typing, allows decimals, and emits `null`/`0` on empty.
Wired into both price + discount fields of `VariationManager` and the
base-price + discount fields of `AdminDashboard`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Renders initial numeric value as text | `MoneyInput.test.tsx` | unit | PASS |
| 2 | Whole number typed without a decimal point | `MoneyInput.test.tsx` | unit | PASS |
| 3 | Trailing `.` survives while typing | `MoneyInput.test.tsx` | unit | PASS |
| 4 | Full decimal value parses correctly | `MoneyInput.test.tsx` | unit | PASS |
| 5 | Empty → null when `allowEmpty` | `MoneyInput.test.tsx` | unit | PASS |
| 6 | Empty → 0 by default | `MoneyInput.test.tsx` | unit | PASS |
| 7 | Non-numeric characters ignored | `MoneyInput.test.tsx` | unit | PASS |
| 8 | Display syncs on external value change | `MoneyInput.test.tsx` | unit | PASS |

## Validation commands run

- RED: `npx vitest run src/components/MoneyInput.test.tsx` → failed (component did not exist).
- GREEN: `npx vitest run src/components/MoneyInput.test.tsx` → 8 passed.
- Full suite: `npx vitest run` → 427 passed (40 files).
- Types: `npx tsc --noEmit` → clean.
- Build: `npx vite build` → success.

## Known gaps

`npx eslint` cannot run due to a pre-existing project tooling mismatch
(ESLint 9.36 vs the installed `@typescript-eslint` plugin) unrelated to this
change; typecheck + build were used to verify instead.
