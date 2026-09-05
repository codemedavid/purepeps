# TDD evidence — Group Buy landing homepage, cart/nav move, popup off

**Branch:** `feat/gb-landing-homepage`
**Scope note:** the closed-state panel (shown instead of the timeline between
buys) was added after the first pass, on a follow-up request; its RED/GREEN
evidence is folded into the tables below.
**Source plan:** none on disk — the plan was produced inline by `/ecc:plan` in the
same session and is restated below. The reference image named in the request was
**not attached to the session**, so the composition was built from the written
brief (badge → headline → description → bordered timeline card with four
icon-connected stages → CTAs → closing line) plus the existing Sakura design
tokens. Flagged to the user rather than guessed at.

## User journeys

1. As a visitor, I want the homepage to show one Group Buy section — status,
   headline, timeline, CTAs — so I understand the current buy without scrolling
   past unrelated blocks.
2. As a visitor, I want the catalog only after I ask for it, so the homepage
   stays a landing page.
3. As an admin, I want to change every word, date and button on that homepage
   from the dashboard, without a code change or a deploy.
4. As a visitor, I do not want a blocking pop-up thrown at me on arrival.
5. As a shopper on a phone, I want the cart beside the burger menu in the
   header, and Reviews as a bottom-navigation destination.

## Decisions taken without an answer from the user

Two questions were raised in the plan and not answered before implementation
began; both were resolved as recommended and are called out here so they can be
reversed cheaply:

- **Group Buy status is `auto | open | closed`, defaulting to `auto`.** The brief
  asked for `Open / Closed`. `auto` follows the live batch so the badge cannot
  claim the buy is open while the server has ordering closed. Verified live: the
  homepage renders `GROUP BUY · CLOSED` because no batch is currently open.
- **The Hero countdown was retired with `Hero.tsx`.** The four admin-set stage
  dates replace it. It was not in the field list; restoring it is additive.

## Task report

| Plan task | Execution | Validation actually run | RED | GREEN |
|---|---|---|---|---|
| Settings module | `src/utils/gbLanding.ts` — 31 keys (34 after the closed-state panel), absent-row defaults, whitelists | `npx vitest run src/utils/gbLanding.test.ts` | unresolved import `./gbLanding`, no tests ran | 29 passed (29) |
| Settings hook | `src/hooks/useGbLanding.ts` — one `.in()` read, fail-open, Realtime, upsert | `npx vitest run src/hooks/useGbLanding.test.ts` | unresolved import `./useGbLanding` | 5 passed (5) |
| Public section | `gb-landing/GroupBuyLanding.tsx`, `gb-landing/GbTimeline.tsx` | `npx vitest run src/components/gb-landing/GroupBuyLanding.test.tsx` | unresolved import `./GroupBuyLanding` | 18 passed (18) |
| Cart → header, Reviews → bottom nav | `Header.tsx`, `StorefrontBottomNav.tsx`, `PublicPageBottomNav.tsx` | per-file vitest (see note) | 13 failed \| 24 passed (37) | 25 + 12 + 9 passed |
| Homepage restructure | `App.tsx` `landing` view; `Menu.tsx` de-hero'd; `Hero.tsx` deleted | `npx vitest run src/App.test.tsx` | 9 failed \| 1 passed (10) | 10 passed (10) |
| Popup off | `useStorefrontNotice.ts` fallback removed + archive migration | `npx vitest run src/hooks/useStorefrontNotice.test.ts` | 5 failed \| 6 passed (11) | 11 passed (11) |
| Admin panel | `GbLandingManager.tsx`, mounted in `SiteSettingsManager` | `npx vitest run src/components/GbLandingManager.test.tsx` | unresolved import `./GbLandingManager` | 7 passed (7) |
| Closed-state panel | 3 more keys; `gb-landing/GbClosedNotice.tsx`; swapped for the timeline when closed | `gbLanding.test.ts`, `GroupBuyLanding.test.tsx`, `GbLandingManager.test.tsx` | 5 failed (32), 4 failed (24), 1 failed (8) | 32, 24, 8 passed |

**Note on running tests in this repo:** passing several test files to one
`vitest run` produces spurious 5s timeouts (three suites that pass individually
reported 3 failures when run together, at 21s wall clock). Per-file runs are
authoritative. A single full-suite `vitest run` is fine.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A missing settings row falls back to the built-in default; a stored row wins verbatim, including a deliberate empty string | `src/utils/gbLanding.test.ts` | unit | PASS |
| 2 | A CTA action outside the whitelist (`javascript:`, an external URL, a data: URI) can never become a navigation | `src/utils/gbLanding.test.ts:parseCtaAction` | unit | PASS |
| 3 | An unknown stage icon falls back instead of resolving an arbitrary identifier | `src/utils/gbLanding.test.ts:parseStageIcon` | unit | PASS |
| 4 | `auto` status follows the live batch; explicit modes override it; a corrupt stored mode behaves as `auto` | `src/utils/gbLanding.test.ts:resolveGbStatus` | unit | PASS |
| 5 | All 34 fields survive a `toRows` → `fromRows` round trip | `src/utils/gbLanding.test.ts:gbLandingToRows` | unit | PASS |
| 6 | Every landing key is read in ONE round trip | `src/hooks/useGbLanding.test.ts` | unit | PASS |
| 7 | A settings outage shows the default copy rather than an empty homepage | `src/hooks/useGbLanding.test.ts` | unit | PASS |
| 8 | A failed save is surfaced, never silently dropped | `src/hooks/useGbLanding.test.ts` | unit | PASS |
| 9 | Badge, headline, highlight, description, timeline title, all four stages' title/description/date/time, both CTAs and the closing note all render from admin content | `GroupBuyLanding.test.tsx` | component | PASS |
| 10 | A blank date, time, highlight or note renders nothing rather than an empty artifact | `GroupBuyLanding.test.tsx` | component | PASS |
| 11 | A CTA with no label, or action `none`, does not render a dead button | `GroupBuyLanding.test.tsx` | component | PASS |
| 12 | The four stages are an ordered list; the connector is `aria-hidden` | `GroupBuyLanding.test.tsx` | component | PASS |
| 13 | The homepage renders the landing and NO catalog until a CTA is used | `src/App.test.tsx` | integration | PASS |
| 14 | The primary CTA reveals the catalog; Home returns to the landing | `src/App.test.tsx` | integration | PASS |
| 15 | The CTA and the Shop tab scroll to the SAME anchor (`#storefront-catalog`) — guards the regression fixed in `7d38677` | `src/App.test.tsx` | integration | PASS |
| 16 | The bottom navigation offers no cart tab and no cart badge | `StorefrontBottomNav.test.tsx` | component | PASS |
| 17 | Reviews is a bottom-nav destination at `/reviews`, gated on the reviews feature flag | `StorefrontBottomNav.test.tsx`, `PublicPageBottomNav.test.tsx` | component | PASS |
| 18 | The header cart is visible at every breakpoint and is the immediate previous sibling of the burger | `Header.test.tsx` | component | PASS |
| 19 | The header cart is visible at every width on the two pages that render their own Header | `ProtocolGuide.test.tsx`, `PeptideCalculator.test.tsx` | component | PASS |
| 20 | No notice appears unless an admin has published one — including while the query is in flight, and when the read fails | `useStorefrontNotice.test.ts` | unit | PASS |
| 21 | A notice the admin HAS published still appears | `useStorefrontNotice.test.ts` | unit | PASS |
| 22 | The admin panel loads current values, edits all 34 fields, saves, and surfaces read/write errors | `GbLandingManager.test.tsx` | component | PASS |
| 23 | CTA destinations are a `<select>` over a fixed list, not a free-text URL | `GbLandingManager.test.tsx` | component | PASS |
| 24 | While the buy is closed the timeline is REPLACED by the closed panel — no stage list remains | `GroupBuyLanding.test.tsx` | component | PASS |
| 25 | The closed panel renders the admin's heading, date and message; a blank date omits the line | `GroupBuyLanding.test.tsx` | component | PASS |
| 26 | The swap follows `auto` (live batch) and both explicit status modes; the CTAs stay available while closed | `GroupBuyLanding.test.tsx` | component | PASS |
| 27 | The closed heading, date and message are editable and saved from the admin panel | `GbLandingManager.test.tsx` | component | PASS |

## Whole-project validation

```
npx vitest run --testTimeout=30000
      Tests  1763 passed (1763)
 Test Files  2 failed | 136 passed (138)
 FAIL  src/hooks/useReturningCustomer.test.ts
 FAIL  src/utils/checkoutPrefill.test.ts
```

The two failing FILES are pre-existing orphans that fail to load and contribute
zero tests; they are unrelated to this branch and were failing before it. **Zero
failing tests.**

```
npx tsc --noEmit -p tsconfig.app.json
  -> no errors in any file touched by this branch
  -> repo-wide pre-existing error lines: 104 before -> 99 after

npm run build
  -> built in 4.79s
```

`tsc` must be given `-p tsconfig.app.json`; a bare `tsc --noEmit` checks zero
files and exits 0.

## Manual verification (Chrome, dev server)

- 1440×1100 — homepage shows the GB section alone: badge, headline, description,
  both CTAs, the bordered timeline card with four icon discs on a horizontal
  connector, closing note, footer. No catalog, no pop-up.
- 390×844 — timeline rotates to a vertical spine with stacked stages; the cart
  sits immediately left of the burger in the header; the bottom bar reads
  Home / Shop / Orders / Reviews with no cart tab.
- Console: no errors or warnings.
- Accessibility tree: one `region` labelled by the `h1`, an `h2` for the timeline,
  `h3` per stage, decorative connector hidden.
- Closed state, verified against the real live batch (which is closed): the
  timeline card is replaced by the "NEXT GROUP BUY" panel. Setting
  `gb_landing_closed_date` to `October 15` made the date appear **without a page
  reload**, confirming the Realtime path from an admin edit to the public page;
  the test value was then reverted to blank so no invented date remains live.

## Known gaps and follow-ups

1. **All three migrations were applied on the user's approval.** Verified after:
   the one notice row is now `archived` (recoverable from Notice Manager),
   `storefront_notice_enabled = 'false'`, and 34 `gb_landing_*` rows exist. The
   pop-up no longer appears on the homepage or the catalog.
2. **COA, FAQ, Track Order and Reviews render no `Header`**, so moving the cart
   there removes their cart entry; it is reached via Shop → header cart. Adding a
   header to those four pages was out of the requested scope.
3. `formatDateRange` / `getCountdownParts` in `src/utils/groupBuySchedule.ts` lost
   their callers when `Hero.tsx` was deleted. `isViewOnlyActive` in the same module
   is still used by `App.tsx`. The unused pair is tested and harmless; deleting it
   is a separate cleanup.
4. The `hero_*` `site_settings` rows are left in the database. Their admin form was
   removed because nothing rendered them any more; the rows are inert and reversible.

## Merge evidence

Checkpoint commits on `feat/gb-landing-homepage`, in order:

```
9d8629b test: add reproducer for the admin-editable GB landing settings   (RED)
632879c feat: add the admin-editable GB landing settings module           (GREEN)
cd8ccfa feat: read and write the GB landing settings in one round trip
9e7dd2b feat: add the Group Buy landing section and its timeline card
4d06bac feat: move the cart to the header and put Reviews in the bottom nav
eec1b64 feat: make the Group Buy landing the whole homepage
5a18002 fix: stop the storefront pop-up opening by itself
3f674c2 feat: add the Group Buy Landing admin panel
```

Each commit body records its own RED and GREEN evidence, so the proof survives a
squash merge.
