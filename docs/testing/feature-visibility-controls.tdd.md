# TDD Evidence — Feature Visibility Controls

**Source plan**: produced inline via `/ecc:plan` in this session (no `*.plan.md` artifact was written).
**Branch**: `fix/bottom-nav-shop-highlight`
**Checkpoints**: `653a4a6` (RED), `1ec7927` (RED), `3ddfe63` (GREEN)

## What was built

Six storefront features — Products, Calculator, Protocols, Track Order, FAQ,
Lab Reports — can be shown or hidden individually from **Admin → Features**.

Each switch is one `site_settings` row. Turning a feature off writes a single
string and deletes nothing: products, protocols, FAQs, lab reports and orders
are untouched, and switching back on restores the feature intact.

**Seeded state, as requested**: Calculator, Protocols, Track Order and FAQ are
seeded **off**; Products and Lab Reports stay **on**.

## User journeys

1. As an admin, I want to switch a feature off, so it disappears from the
   customer-facing navigation.
2. As an admin, I want switching off to preserve all content, so switching back
   on restores the feature intact.
3. As a customer, when a feature is off, its URL should take me home rather than
   a broken page.
4. As a customer, I must not be bounced off a page I legitimately requested
   while the flags are still loading.
5. As an admin, if the settings store is unreachable, features stay visible
   rather than the site looking broken.

## Task report

### Task 1 — Flag vocabulary and storage (`src/utils/featureFlags.ts`)

Feature registry, `site_settings` keys, and fail-open parsing. Lab Reports
deliberately reuses the pre-existing `coa_page_enabled` key so any value an
admin set before these controls existed is honoured.

- **RED**: `npx vitest run featureFlags …` → spec failed to resolve
  `./featureFlags` (compile-time RED; module did not exist).
- **GREEN**: `npx vitest run src/utils/featureFlags.test.ts` → `17 passed (17)`.

### Task 2 — Read/write hook (`src/hooks/useFeatureFlags.ts`)

All six rows in one round trip; best-effort Realtime; single-key admin write.

- **RED**: spec failed to resolve `./useFeatureFlags`.
- **GREEN**: `npx vitest run src/hooks/useFeatureFlags.test.ts` → `12 passed (12)`.

### Task 3 — Route guard (`src/components/FeatureRoute.tsx`)

Redirects a switched-off route to `/`, and **never** while flags are loading.

- **RED**: spec failed to resolve `./FeatureRoute`.
- **GREEN**: `npx vitest run src/components/FeatureRoute.test.tsx` → `4 passed (4)`.

### Task 4 — Navigation gating (`Header`, `Footer`, `StorefrontBottomNav`, `ProtocolGuide`)

Header's desktop bar and side drawer now render from one `NAV_ITEMS` list
instead of two hand-maintained copies.

- **RED (header)**: `npx vitest run … Header` → `5 failed | 2 passed (7)` — the
  two pre-existing tests still passed; the five new ones failed because Header
  rendered every entry unconditionally.
- **RED (footer + bottom nav)**: `npx vitest run src/components/Footer.test.tsx
  src/components/StorefrontBottomNav.test.tsx` → `6 failed | 25 passed (31)`.
- **GREEN**: Header `7 passed`, Footer `4 passed`, StorefrontBottomNav
  `27 passed`.

### Task 5 — Admin panel (`src/components/FeatureVisibilityManager.tsx`)

Six switches mirroring `AccessIntakeToggle`, reachable from a new **Features**
tile in the dashboard.

- **RED**: spec failed to resolve `./FeatureVisibilityManager`.
- **GREEN**: `npx vitest run src/components/FeatureVisibilityManager.test.tsx`
  → `8 passed (8)`.

### Task 6 — Seed migration

`supabase/migrations/20260824000200_feature_visibility_flags.sql`. Idempotent
(`ON CONFLICT DO NOTHING`), so re-running never re-hides a page an admin has
since switched back on. Guarded, best-effort Realtime publication add.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | Only the exact string `'false'` hides a feature; missing/invalid values fail open | `src/utils/featureFlags.test.ts` | unit | PASS |
| 2 | Lab Reports reuses the pre-existing `coa_page_enabled` key | `src/utils/featureFlags.test.ts` | unit | PASS |
| 3 | Unrelated `site_settings` rows never affect the flags | `src/utils/featureFlags.test.ts` | unit | PASS |
| 4 | All six keys are read in a single query | `src/hooks/useFeatureFlags.test.ts` | integration | PASS |
| 5 | A read error leaves every feature visible | `src/hooks/useFeatureFlags.test.ts` | integration | PASS |
| 6 | Switching one feature writes only its own key and leaves the other five unchanged | `src/hooks/useFeatureFlags.test.ts` | integration | PASS |
| 7 | No table other than `site_settings` is ever written | `src/hooks/useFeatureFlags.test.ts` | integration | PASS |
| 8 | A write failure propagates instead of reporting false success | `src/hooks/useFeatureFlags.test.ts` | integration | PASS |
| 9 | Flags still resolve when Realtime is unavailable | `src/hooks/useFeatureFlags.test.ts` | integration | PASS |
| 10 | A switched-off route redirects to the storefront | `src/components/FeatureRoute.test.tsx` | unit | PASS |
| 11 | No redirect occurs while flags are still loading | `src/components/FeatureRoute.test.tsx` | unit | PASS |
| 12 | A switched-off feature leaves both the desktop nav and the side drawer | `src/components/Header.test.tsx` | unit | PASS |
| 13 | Hiding Products does not affect the cart control | `src/components/Header.test.tsx` | unit | PASS |
| 14 | Footer quick links drop with their feature; the heading hides when empty | `src/components/Footer.test.tsx` | unit | PASS |
| 15 | Bottom-bar Orders / Guides tabs drop with their feature and the column count adapts | `src/components/StorefrontBottomNav.test.tsx` | unit | PASS |
| 16 | Home, Shop and Cart survive with every optional tab off | `src/components/StorefrontBottomNav.test.tsx` | unit | PASS |
| 17 | Each admin switch reflects and toggles only its own feature | `src/components/FeatureVisibilityManager.test.tsx` | unit | PASS |
| 18 | The admin panel states that nothing is deleted | `src/components/FeatureVisibilityManager.test.tsx` | unit | PASS |
| 19 | A save failure surfaces to the admin | `src/components/FeatureVisibilityManager.test.tsx` | unit | PASS |

**Aggregate**: `npx vitest run featureFlags useFeatureFlags FeatureRoute
FeatureVisibilityManager Header Footer StorefrontBottomNav PublicPageBottomNav
App` → **`Test Files 9 passed (9)` / `Tests 89 passed (89)`**.

**Build**: `npx vite build` → `✓ built in 26.77s`.

**Typecheck**: `npx tsc --noEmit -p tsconfig.app.json` → 0 errors in any changed
file. Repo-wide pre-existing errors went from 74 (baseline `HEAD`) to 60.

## Coverage and known gaps

- **Coverage was not measured.** `@vitest/coverage-v8` is not installed and a
  dependency was not added, because a second session was writing to this working
  tree concurrently. The 80% gate is therefore **unverified**, not met — every
  new module has a dedicated spec, but that is a proxy, not a measurement.
- **No E2E test.** The redirect-on-disabled-route journey is covered by
  `FeatureRoute.test.tsx` at the component level only; the project has no
  Playwright harness.
- **Manual verification not performed.** Breakpoint checks (375 / 768 / 1440),
  an end-to-end admin toggle against a live database, and confirmation that
  content survives a switch-off round trip remain outstanding. There is no `.env`
  in this checkout, so no live database was reachable.
- **Two files left uncommitted.** `src/App.tsx` (provider + route guards) and
  `src/components/ProtocolGuide.tsx` (calculator cross-link gating) carry this
  feature's wiring but are interleaved with another session's concurrent,
  unvalidated edits in the same tree. They are validated on disk (the 89 passing
  tests and the build both exercise them) but were not staged, so this feature is
  **not yet active from a fresh checkout of these commits alone**.
- **Realtime is best-effort.** No `supabase_realtime` publication statement
  existed in the repo; the migration adds `site_settings` to it inside a guarded
  block. If it does not apply, an admin toggle simply lands on the next page
  load.
- **Flags are not a security boundary.** `site_settings` is anon-readable, so
  flag values are public. Nothing gated here exposes member-only data; the flags
  drive UX.

## Merge evidence

If these commits are squashed, preserve:

- **RED** `653a4a6` — 4 specs unresolvable (compile-time RED) + Header
  `5 failed | 2 passed`.
- **RED** `1ec7927` — Footer + bottom nav `6 failed | 25 passed`.
- **GREEN** `3ddfe63` — 9 files / 89 tests passed; `vite build` clean.
