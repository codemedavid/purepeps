# "Print all waybills" was white text on no background

## Source plan

No `*.plan.md`. Derived during this TDD run from the site owner's report, in two
parts across one session: first "why cant i see the print all waybills?", then
"the print all waybills font color is white".

## Root cause

`tailwind.config.js` extends `theme.colors` with exactly three families —
`brand`, `charcoal`, `sakura` — plus a handful of single-value names. There is
no `navy` family and no `gold` family.

Tailwind emits nothing for a class whose colour it cannot resolve. No error, no
warning, no build failure: `bg-navy-900` simply does not exist in the output. The
button kept its `text-white`, so it rendered white text over the white filter
card it sits on.

Confirmed against the real build — `bg-navy-900` appears **0 times** in
`dist/assets/index-*.css`.

This is why the button "could not be found" earlier in the session. It was never
missing. It rendered on every page load, in the right place, unreadable.

### Blast radius

| Reference | Count in `src/` | Resolves? |
|---|---|---|
| `navy-*` | 239 | No |
| `gold-*` | 141 | No |
| of those, `text-white` over `bg-navy-*` | 16 sites | No — invisible control |

Only the 16 invisible sites were fixed. The remaining dead references are
inert (`text-navy-900` falls back to inherited colour and reads as ordinary
dark text) and are left for a separate sweep — see Known gaps.

## User journeys

1. As an admin on the Orders screen, I want the "Print all waybills" button to be
   legible, so that I can find and click it instead of hunting for white text on
   a white card.
2. As an admin anywhere in the app, I want no action button to render invisibly,
   so that a dead colour class can never silently remove a control again.

## Task report

### 1. Reproduce the invisibility without a browser

jsdom runs no Tailwind pipeline and computes no colours, so a render test cannot
see this class of bug. The guard instead resolves the real palette from
`tailwind.config.js` merged over `tailwindcss/colors`, then reads the shipped
class strings and flags any `bg-` token used beside `text-white` that the
palette cannot resolve.

- Command: `npx vitest run src/tailwindPalette.test.ts`
- RED: `1 failed | 1 passed`, listing 25 unresolved tokens across 16 sites
  (`ArticleDetail:142`, `FAQ:86`, `FAQManager:122,145,223`,
  `OrderTracking:462,629,701`, `OrdersManager:669,781`,
  `PeptideCalculator:217,227`, `PeptideInventoryManager:332`,
  `LeftoverClaimPanel:211`, `OrderHistorySection:86`, `TrackedOrderRecord:108`).

The companion assertion — that the palette itself resolves `sakura-dark`,
`brand-400` and `gray-100` — passed in the same RED run, so the failure is the
bug and not a broken harness.

### 2. Point the sixteen sites at a colour that exists

`bg-navy-900` → `bg-sakura-dark` (#1E0E16), `hover:bg-navy-800` →
`hover:bg-sakura-deep`, `border-navy-900` → `border-sakura-dark`. Applied to the
sixteen reported lines only, by line number, with the edit script asserting each
line actually changed so silent drift would fail loudly rather than skip.

Chosen over defining a `navy` family in the config: that would have revived all
380 dead references at once and changed the appearance of roughly forty files,
including many that currently look correct. The sakura palette already backs the
shared admin frame.

- Command: `npx vitest run src/tailwindPalette.test.ts`
- GREEN: `1 passed (1)`, `2 passed (2)`

### 3. Confirm the fix reaches the browser

A passing guard proves the token resolves in the config. It does not prove
Tailwind emitted a rule. Verified against a real production build:

- Command: `npx vite build` then grep `dist/assets/index-_824JAar.css`
- `.bg-sakura-dark{--tw-bg-opacity: 1;background-color:rgb(30 14 22 / var(--tw-bg-opacity, 1))}`
- `bg-navy-900` — 0 occurrences

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | The Tailwind palette resolves from the config, so the guard below is meaningful | `src/tailwindPalette.test.ts:resolves the project palette from the Tailwind config` | unit | PASS | `npx vitest run src/tailwindPalette.test.ts` |
| 2 | No source line pairs `text-white` with a background colour Tailwind cannot resolve | `src/tailwindPalette.test.ts:never pairs text-white with a background colour Tailwind cannot resolve` | unit | PASS | `npx vitest run src/tailwindPalette.test.ts` |
| 3 | `.bg-sakura-dark` is emitted with a real colour, and `bg-navy-900` is absent | `npx vite build` + grep of `dist/assets/*.css` | build | PASS | `background-color:rgb(30 14 22)`; 0 hits for `bg-navy-900` |

## Coverage and known gaps

No `test:coverage` script exists in this repo, so no coverage number was
produced. Full-suite regression instead:

- `npx vitest run` — **1871 tests passed**, 0 test failures.
- The `2 failed` *files* are the pre-existing orphans (`checkoutPrefill.test.ts`
  imports a module that does not exist); unrelated and untouched.
- `npx tsc --noEmit -p tsconfig.app.json` — 54 errors, all pre-existing.
  Measured by stashing the working tree: 55 before, 54 after. The one removed is
  the `TS7016` this work briefly introduced by importing the untyped config;
  `src/vite-env.d.ts` now declares its shape.

**Intentional gaps:**

- 223 `navy-*` and 141 `gold-*` references remain in `src/`. They are dead but
  not visibly broken — they set borders, focus rings and text colours that fall
  back silently. The guard does not fail on them, by design: it covers only the
  `text-white` pairing that makes a control invisible. A full sweep is a
  separate, larger, and more design-sensitive job.
- Not verified in a browser. The build-output check stands in for a screenshot.

## Merge evidence

| Stage | Commit | Verified |
|---|---|---|
| RED | `65a6770 test: add reproducer for white-on-dead-background admin controls` | `1 failed`, 25 unresolved tokens listed |
| GREEN | `cd6aa5f fix: give white-on-dark admin controls a background that resolves` | `2 passed`; full suite 1871 passed; build emits the colour |

No refactor commit — the fix is a class-string swap and the guard was written in
final form.

**Not deployed.** Both commits sit on `feat/gb-landing-homepage`, which has no
upstream and has never been pushed. `main` does not contain them, so the live
site still shows the invisible button.
