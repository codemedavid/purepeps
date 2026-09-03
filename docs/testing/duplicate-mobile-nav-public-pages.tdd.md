# TDD Evidence — duplicate mobile navigation on Calculator and Protocols

**Source plan:** none. This began as a diagnostic question — *"why can't I see the burger menu in the header when I'm using a small device"* — and the investigation surfaced a real inconsistency. Direction confirmed by the user: **"Finish the removal"**.
**Date:** 2026-09-04
**Branch:** `feat/pay-now-cod-payment-options`
**Commits:** `be04463` (RED) → `3e69a07` (GREEN)

## The Question, Answered

The missing burger is **not** a defect. Mobile navigation on the storefront was deliberately moved to a bottom tab bar in `daa8526 "refactor: remove duplicate mobile storefront controls"`:

- `App.tsx:206` passes `hideMobileStorefrontActions` to `<Header>`.
- `Header.tsx:127` / `:146` gate the burger button and its drawer on `!hideMobileStorefrontActions`; `Header.tsx:103` sends the header cart to `hidden md:block`.
- `StorefrontBottomNav.tsx:57` renders the replacement — a `fixed … md:hidden` bottom bar.
- Pinned by `Header.test.tsx:32` *"suppresses mobile storefront actions while retaining a desktop cart"*.

## The Defect That Investigation Found

`daa8526` was incomplete. `/calculator` (`PeptideCalculator.tsx:82`) and `/protocols` (`ProtocolGuide.tsx:40`) rendered `<Header>` **without** the flag, while their route wrapper `PublicNoticePage` (`App.tsx:340`) also renders `PublicPageBottomNav`. On a phone those two pages showed a burger drawer *and* a bottom bar — the exact duplication `daa8526` set out to remove.

A second, latent defect rode along: both call sites omitted `Header`'s required `onGetAccess` and `isVerified` (added later in `3ddfe63`), leaving two `TS2739` errors. At ≥640px the access pill is `hidden sm:inline-flex`, so both pages rendered a pill that advertised "Get access" to signed-in members and **threw `TypeError: onGetAccess is not a function` on tap**. This never broke the build: `npm run build` is a bare `vite build` with no `tsc`, and root `tsconfig.json` has `"files": []`, so even `tsc --noEmit` checks nothing — it needs `-p tsconfig.app.json`.

## User Journeys
1. As a customer on a phone, I want one navigation per screen, so tapping around `/calculator` and `/protocols` works the same way as the storefront.
2. As a signed-in member on a laptop, I don't want a page to offer me "Get access" — and tapping it must never throw.

## Task Report

| Task | Summary | Validation | RED → GREEN | Guarantee |
|---|---|---|---|---|
| Reproducers | Assert neither page exposes a "Toggle menu" control and that the header cart is desktop-only. ProtocolGuide's `vi.mock('./Header')` stub removed so the real contract is exercised. | `npx vitest run src/components/PeptideCalculator.test.tsx src/components/ProtocolGuide.test.tsx` | **4 failed \| 15 passed** — burger present on both pages; cart class list `relative p-2.5 …` with no `hidden md:block` | Failure was the intended bug, not setup: the 15 pre-existing ProtocolGuide tests passed against the real Header |
| Finish the removal | `hideMobileStorefrontActions` added to both call sites | `npx vitest run …PeptideCalculator… …ProtocolGuide… …Header…` | 4 failed → **26 passed** | Mobile navigation on every public page is the bottom bar alone |
| Access pill | `onGetAccess`/`isVerified` made optional; pill omitted when no handler is supplied | `npx tsc --noEmit -p tsconfig.app.json` | 2 × `TS2739` → **0 errors at those call sites** | A page that does not own access state renders no pill instead of a false one that throws |
| No regressions | Full suite | `npx vitest run` | **1457 passed, 0 failed** | Header's contract change breaks nothing else |

## Test Specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | `/calculator` leaves mobile navigation to the bottom bar — no burger drawer | `PeptideCalculator.test.tsx:leaves mobile navigation to the bottom bar instead of a burger drawer` | unit | PASS |
| 2 | `/calculator`'s header cart is confined to desktop widths | `PeptideCalculator.test.tsx:keeps the header cart to desktop widths` | unit | PASS |
| 3 | `/protocols` leaves mobile navigation to the bottom bar — no burger drawer | `ProtocolGuide.test.tsx:leaves mobile navigation to the bottom bar instead of a burger drawer` | unit | PASS |
| 4 | `/protocols`'s header cart is confined to desktop widths | `ProtocolGuide.test.tsx:keeps the header cart to desktop widths` | unit | PASS |
| 5 | The storefront still suppresses mobile actions while keeping a desktop cart | `Header.test.tsx:suppresses mobile storefront actions while retaining a desktop cart` | unit | PASS (pre-existing, unchanged) |
| 6 | The burger and drawer still work wherever a page does opt in | `Header.test.tsx:keeps the cart and mobile menu controls by default` | unit | PASS (pre-existing, unchanged) |

## Coverage and Known Gaps

- **Coverage not measured.** `@vitest/coverage-v8` is not installed and there is no `test:coverage` script; installing a dependency was outside what was asked. Per-file evidence is in the table above.
- **Two pre-existing test files fail to load, unrelated to this change:** `src/utils/checkoutPrefill.test.ts` and `src/hooks/useReturningCustomer.test.ts` import `./checkoutPrefill` and `./useReturningCustomer`, neither of which exists. Both were committed in `bbb47eb`. They contribute 0 of the 1457 assertions and are orphan tests awaiting their implementations.
- **The access pill is now absent on `/calculator` and `/protocols`, not wired up.** Routing it properly needs an `'access'` member on `StorefrontRequest` (`storefrontNavigation.ts:17`) plus handling in `MainApp` and `PublicPageBottomNav` — beyond the chosen scope. Omitting a broken CTA is strictly better than rendering one that throws, but it *is* a removed desktop CTA. Follow-up if the pill is wanted there.
- **No visual-regression coverage.** The `hidden`/`md:hidden` classes are asserted as class lists in jsdom, which cannot prove the rendered result at a real 320/375/768px viewport. A Playwright screenshot pass over `/`, `/calculator` and `/protocols` at those widths would close this.
- `ProtocolGuide.tsx` still carries a pre-existing `TS6133` unused-import warning for `AlertTriangle`, untouched here.

## Merge Evidence

If `be04463`/`3e69a07` are squashed: RED was 4 failing assertions across two new test blocks proving both pages rendered a burger drawer alongside the bottom bar; GREEN was 26 passing in the affected files and 1457 passing across the suite, with the two `TS2739` call-site errors cleared. No refactor step was needed.

Only the single `hideMobileStorefrontActions` line was staged from each page file — the rest of their working-tree changes (`BOTTOM_NAV_CLEARANCE`, the calculator-flag CTA gate) are unrelated in-progress branch work and remain uncommitted.
