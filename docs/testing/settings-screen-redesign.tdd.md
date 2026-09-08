# Settings screen redesign — TDD evidence

Branch: `feat/gb-landing-homepage`
Checkpoints: `970e208` (RED) → `cb4e010` (GREEN) → refactor commit (this report)

## Source plan

No `*.plan.md` was supplied. The journeys below were derived during this TDD run.

**Scope note.** The original request was to import a Claude Design file
(`Storefront Settings.dc.html`, project `87efd492-…`) through the design MCP and
implement it. `DesignSync` refused every call with *"needs design-system
authorization. Run /design-login"*, on both the first attempt and a later retry.
The user then asked *"why need mcp when we are just changing the design of this
websitr seeting in the admin page"*, and the work proceeded on the model's own
design judgement against `~/.claude/rules/ecc/web/design-quality.md` instead.

**This is therefore not a reproduction of that design file, which was never
read.** If the file is later imported, this screen should be reconciled against
it. The file's name ("Storefront Settings") also suggests it may target a
customer-facing surface rather than `AdminDashboard → Settings`, which is what
was actually redesigned here.

## User journeys

1. As an admin, I want the settings areas listed up front so I can jump straight
   to one instead of scrolling past a 400-line form to reach the notice manager.
2. As an admin on a keyboard or screen reader, I want each area to be a labelled
   landmark so I can move between them.
3. As an admin, I want the rail to show which area I am currently looking at.
4. As an admin, I still need the three panels that actually drive the storefront
   (regression guard on the existing behaviour).

## Task report

### 1. Settings shell — header, rail, landmarks (journeys 1, 2, 4)

Replaced the flat `space-y-8` stack of three visually identical cards with a
titled header, a sticky section rail, and one labelled landmark per panel.

RED — `npx vitest run src/components/SiteSettingsManager.test.tsx`

```
Tests  5 failed | 5 passed (10)
```

The five failures were the new layout assertions. The rendered DOM at RED was
the bare stack, confirming the failure cause:

```html
<div class="space-y-8 pb-12">
  <div data-testid="access-intake-toggle" />
  <div data-testid="gb-landing-manager" />
  <div data-testid="storefront-notice-manager" />
</div>
```

GREEN — same command

```
Tests  10 passed (10)
```

Guaranteed: the screen exposes an `h1`, a `navigation` landmark named "Settings
sections" holding exactly three links, each link's `href` matches the `id` of
the `region` that wraps the matching panel, and all three panels still mount.

### 2. Active-section tracking (journey 3)

Added `useActiveSection`, an IntersectionObserver hook that reports which
section is in view so the rail can mark it.

RED — `npx vitest run src/hooks/useActiveSection.test.ts` (compile-time RED)

```
Error: Failed to resolve import "./useActiveSection" from
"src/hooks/useActiveSection.test.ts". Does the file exist?
Test Files  1 failed (1) | Tests  no tests
```

First implementation run returned `2 failed | 4 passed (6)` — both failures were
a defect in the *test*, not the hook: the fake observer's callback fired outside
React's `act()`, so the re-render never flushed. Wrapping the two callback calls
in `act()` fixed it. No implementation change was made for those two.

GREEN — same command

```
Tests  6 passed (6)
```

Guaranteed: the hook returns `null` before anything intersects and on browsers
with no `IntersectionObserver` (degrading to "highlight nothing" rather than
throwing); it reports the intersecting section; it keeps the last active section
when everything leaves the band; it disconnects on unmount; and it does **not**
rebuild the observer when a caller passes a fresh array of the same ids — it
keys the effect on the joined ids, so the normal `map`-over-a-literal caller
cannot spin the effect.

### 3. Browser verification (not covered by the suite)

`SiteSettingsManager` was rendered standalone against a throwaway Vite entry
(deleted afterwards; `/admin` itself is behind a sign-in this run had no
credentials for). Checked in Chrome via devtools MCP:

| State | `aria-current` across the three rail links |
|---|---|
| At rest, scrolled to top | `Access=true`, Homepage off, Notices off |
| Scrolled to `#settings-homepage` | Access off, `Homepage=true`, Notices off |
| Scrolled back to top | `Access=true`, Homepage off, Notices off |

Exactly one item is ever current. An initial `-10% 0px -70% 0px` band left
**nothing** highlighted at rest — the first section sat below the band — and was
widened to `-5% 0px -50% 0px`, then re-verified. At 390px the rail collapses to
a horizontal chip row and `scrollWidth === clientWidth` (no horizontal overflow).

A first screenshot also showed the section eyebrow repeating each panel's own
`<h2>` verbatim ("NEW ACCESS REQUESTS" directly above "New Access Requests").
The visible eyebrow now carries the short rail label; the full name remains the
landmark's accessible name and the panel's own heading.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | The screen renders an `h1` titled "Settings" | `SiteSettingsManager.test.tsx:titles the screen so the header is not just three anonymous cards` | unit | PASS | `npx vitest run src/components/SiteSettingsManager.test.tsx` |
| 2 | A navigation landmark "Settings sections" lists exactly three links | `SiteSettingsManager.test.tsx:lists every section in a labelled rail` | unit | PASS | same |
| 3 | Each rail link's `href` targets the section it names | `SiteSettingsManager.test.tsx:points each rail link at the section it names` | unit | PASS | same |
| 4 | Each panel sits inside a landmark named after that panel | `SiteSettingsManager.test.tsx:wraps each panel in a landmark named after the panel` | unit | PASS | same |
| 5 | Each landmark carries the `id` its rail link targets | `SiteSettingsManager.test.tsx:gives each landmark the id its rail link targets` | unit | PASS | same |
| 6 | The three storefront-driving panels still mount | `SiteSettingsManager.test.tsx:keeps the panels that actually drive the storefront` | unit | PASS (pre-existing) | same |
| 7 | The removed "General Site Settings" card and its inert fields stay gone | `SiteSettingsManager.test.tsx` (4 pre-existing tests) | unit | PASS (pre-existing) | same |
| 8 | No active section is reported before anything intersects | `useActiveSection.test.ts:reports no active section before anything has intersected` | unit | PASS | `npx vitest run src/hooks/useActiveSection.test.ts` |
| 9 | The section scrolled into view becomes active | `useActiveSection.test.ts:reports the section that scrolled into view` | unit | PASS | same |
| 10 | The last in-view section stays active once it scrolls out | `useActiveSection.test.ts:keeps the last section that was in view once it scrolls back out` | unit | PASS | same |
| 11 | A browser with no IntersectionObserver degrades instead of throwing | `useActiveSection.test.ts:survives a browser with no IntersectionObserver instead of throwing` | unit | PASS | same |
| 12 | The observer disconnects on unmount | `useActiveSection.test.ts:stops observing when the screen unmounts` | unit | PASS | same |
| 13 | A fresh array of the same ids does not rebuild the observer | `useActiveSection.test.ts:does not rebuild the observer when the caller passes a fresh array of the same ids` | unit | PASS | same |

## Coverage and known gaps

**Coverage was not measured.** `package.json` has no `test:coverage` script and
`@vitest/coverage-v8` is not installed, so the skill's Step 7 could not be run:

```
NO COVERAGE PROVIDER INSTALLED (package.json also has no test:coverage script)
```

Installing a coverage provider was outside the scope of a design change and was
not done. The 80% threshold is therefore **unverified** for this change.

Other gaps:

- **No E2E test.** `/admin` is behind a sign-in and this run had no credentials.
  The browser checks above were done by hand against a temporary entry point,
  not captured as a Playwright spec. The repo has no Playwright setup.
- **No visual-regression baseline.** Screenshots were taken and inspected, not
  committed as reference images.
- **Scroll-spy is only unit-tested through a fake observer.** jsdom has no real
  IntersectionObserver; real scrolling was verified in Chrome by hand (above).
- **`npx eslint` cannot run in this repo** — it crashes loading
  `@typescript-eslint/no-unused-expressions`
  (`Cannot read properties of undefined (reading 'allowShortCircuit')`), a
  pre-existing version mismatch unrelated to this change. No formatter is
  installed either, so formatting was matched to the surrounding files by hand.

## Suite and typecheck state

| Check | Before | After |
|---|---|---|
| `npx vitest run` | 1858 passed, 142 files passed, 2 files failed | 1864 passed, 143 files passed, 2 files failed |
| `npx tsc --noEmit -p tsconfig.app.json` | errors in 5 pre-existing test files | unchanged; **no errors** in either changed file |

The 2 failing FILES are the repo's known orphans — `useReturningCustomer.test.ts`
and `checkoutPrefill.test.ts` — which import modules that do not exist and run
`(0 test)` each. They contribute **0 failed tests** and predate this work.

Note that a bare `tsc --noEmit` exits 0 while checking zero files in this repo;
`-p tsconfig.app.json` is required for the check to mean anything.

## Merge evidence

If these checkpoints are squashed, preserve:

- **RED** `970e208` — 5 new layout tests failed against the flat card stack
  (`5 failed | 5 passed`); the hook suite failed to resolve `./useActiveSection`.
- **GREEN** `cb4e010` — settings shell landed, `10 passed (10)`; hook landed,
  `6 passed (6)`.
- **REFACTOR** — dropped `React.FC` per the project's TS style rule, removed the
  eyebrow/heading duplication, widened the active band so the rail highlights at
  rest, re-verified in Chrome. Full suite `1864 passed`, both changed files
  typecheck clean.
