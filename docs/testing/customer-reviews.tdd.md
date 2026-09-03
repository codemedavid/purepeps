# TDD Evidence — Customer Reviews

**Source plan**: produced inline via `/ecc:plan` (no `*.plan.md` artifact was written).
**Branch**: `feat/pay-now-cod-payment-options`
**Status**: feature complete for all six journeys — data layer (Part 1), public
read surface (Part 2), admin moderation queue (Part 3), customer submission
form (Part 4). Not yet applied to a live database — see "Known gaps".

| Part | Scope | Checkpoints |
|---|---|---|
| 1 | Table, RLS, three RPCs, pure client logic | `09f0fa4` RED, `5ecca26` GREEN, `092ef68` RED, `d4d3c14` GREEN |
| 2 | Feature flag, presentation, read hook, page, route + nav | `db3efe9` RED, `5674477` GREEN, `a574d17` RED, `291c2c7` GREEN, `4beea67` RED, `d3973ad` GREEN, `0241e62` RED, `4bfae96` GREEN, `fb65f51` RED, `f0a2956` GREEN |
| 3 | Admin moderation hook, queue screen, dashboard wiring | `57016fb` RED, `432ff38` GREEN, `bba0e6f` RED, `9a79e23` GREEN |
| 4 | Submission hook, review form, page wiring | `1c30472` RED, `bc87d38` GREEN, `fcb2d12` RED, `477239a` GREEN, `d9e6db7` GREEN |

---

# Part 1 — Data layer

## What was built

The verified-purchase foundation for customer reviews: one table, its RLS, and
the three RPCs that are the only way the public storefront touches it, plus the
pure client logic they pair with.

A customer proves a purchase with **order number + email**, which must both match
the **same** order, and that order must be `order_status = 'delivered'`. They may
then review only the products in that order. Every review is born
`status = 'pending'` and is invisible until an admin approves it.

### The privacy boundary

A review row holds public content (chosen display name, rating, body, media,
product, date, admin reply) alongside private verification data (real name,
email, phone, order number). Three independent mechanisms keep them apart:

1. **anon holds no grant on `product_reviews`.** It cannot `SELECT` the table at
   all, so there is no policy to misconfigure and no column to leak.
2. **`get_approved_reviews`' `RETURNS TABLE` contains no private column.** The
   signature *is* the filter — adding PII to the table later cannot widen it.
3. **RLS** confines all direct access to `public.is_admin()`.

### Why submission is an RPC, not an anon INSERT

An anon `INSERT` would mean the client supplies `reviewer_name`, `reviewer_email`,
`reviewer_phone` and `status` — so a forged request could post a pre-approved
review under someone else's name. `submit_product_review` instead takes **no
order id**, re-derives the order from the raw order number + email, proves the
product was in that order's items, snapshots identity **from the order row**, and
hard-codes `'pending'`. This is the same client-supplied-identifier class of hole
closed in `0fb58d9`.

## User journeys

1. As a customer with a delivered order, I want to prove my purchase with order
   number + email, so I can review only what I actually bought.
2. As a reviewer, I want to pick any display name, so my real identity stays
   private.
3. As a shopper, I want to see only approved reviews with a Verified Purchase
   label, so I can trust them.
4. As an admin, I want to privately see real name, email, phone, order and
   product, so I can verify before approving.
5. As an admin, I want to approve, reject, hide, delete and reply, so only vetted
   reviews go public.
6. As a visitor, I want a results-may-vary disclaimer above reviews, so I set
   safe expectations.

Journeys 3–5 are served by the data layer built here but have **no UI yet**.

## Task report

### Task 1 — Pure review logic (`src/utils/reviews.ts`)

Rating/body/display-name rules, server-matching normalization, rating
aggregation, the disclaimer copy, and `toPublicReview` — the client-side mirror
of the SQL privacy boundary.

- **RED**: `npx vitest run src/utils/reviews.test.ts` →
  `Failed to resolve import "./reviews" from "src/utils/reviews.test.ts"`;
  `Test Files 1 failed (1)`, `Tests no tests`. Compile-time RED from the missing
  implementation module.
- **GREEN**: `npx vitest run src/utils/reviews.test.ts` → `Tests 37 passed (37)`.
- **Typecheck**: `npx tsc --noEmit -p tsconfig.app.json` → no diagnostic
  mentioning either file.

Two **test-side** corrections were needed during GREEN (the code was correct):

- `/idance\./` also matched the legitimate `"guidance."` ending, so the
  anti-truncation assertion failed against correct copy. Anchored to
  `/\bidance\./`.
- `PublicReview → Record<string, unknown>` raised `TS2352`; routed through
  `unknown`.

### Task 2 — Migration (`supabase/migrations/20260826000000_customer_reviews.sql`)

`public.product_reviews`, its RLS and indexes, and `get_reviewable_order`,
`submit_product_review`, `get_approved_reviews`. Plus
`20260826000100_review_feature_flags.sql`, seeding `feature_reviews_enabled` and
`feature_review_media_enabled` with `ON CONFLICT (id) DO NOTHING`.

- **RED**: `npx vitest run src/utils/reviewsMigration.test.ts` → `ENOENT` on
  `supabase/migrations/20260826000000_customer_reviews.sql`;
  `Test Files 1 failed (1)`, `Tests no tests`.
- **GREEN**: `npx vitest run src/utils/reviewsMigration.test.ts` →
  `Tests 32 passed (32)`.

One **test-side** correction: the index assertions used `\S+ ON public\.`, which
demanded the statement on a single line while the SQL wraps it. Loosened to
`\S+\s+ON`, asserting the same index.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | Only whole stars 1–5 are accepted; 4.5, NaN, `'5'`, 0 and 6 are rejected | `src/utils/reviews.test.ts` — "rating validation" | unit | PASS | `npx vitest run src/utils/reviews.test.ts` |
| 2 | A blank display name becomes "Verified Customer", never a name from the order | `src/utils/reviews.test.ts` — "display name normalization" | unit | PASS | same |
| 3 | Client normalization of order number/email matches the SQL `lower(btrim(...))` | `src/utils/reviews.test.ts` — "order number and email normalization" | unit | PASS | same |
| 4 | Submission validation reports every field error at once, not one per submit | `src/utils/reviews.test.ts` — "reports every problem at once" | unit | PASS | same |
| 5 | Out-of-range ratings are ignored rather than skewing the average | `src/utils/reviews.test.ts` — "ignores out-of-range ratings" | unit | PASS | same |
| 6 | `toPublicReview` drops name/email/phone/order fields and they survive no JSON round-trip | `src/utils/reviews.test.ts` — "public projection" | unit | PASS | same |
| 7 | The disclaimer is a finished sentence, not the truncated source copy | `src/utils/reviews.test.ts` — "is a finished sentence" | unit | PASS | same |
| 8 | Every review row is tied to an order via FK and to a product id | `src/utils/reviewsMigration.test.ts` — "product_reviews table" | migration | PASS | `npx vitest run src/utils/reviewsMigration.test.ts` |
| 9 | The database itself constrains rating to 1–5 and status to four known states | same — "constrains rating", "defaults every review to pending" | migration | PASS | same |
| 10 | One review per (order, product), so a delivered order cannot be farmed | same — "allows one review per purchased product" | migration | PASS | same |
| 11 | anon receives no SELECT/INSERT/UPDATE/DELETE grant on `product_reviews` | same — "gives anon no direct access" | migration | PASS | same |
| 12 | All direct table access requires `public.is_admin()` | same — "restricts every direct read and write to admins" | migration | PASS | same |
| 13 | `get_reviewable_order` requires order number AND email on the same delivered order | same — "requires the order number AND the email" | migration | PASS | same |
| 14 | No public RPC signature contains a PII column | same — "never returns customer PII", "exposes no PII column" | migration | PASS | same |
| 15 | `submit_product_review` accepts no order id and re-verifies from raw inputs | same — "re-verifies the order number and email itself" | migration | PASS | same |
| 16 | Reviewer identity is snapshotted from the order row, never from parameters | same — "snapshots reviewer identity from the order row" | migration | PASS | same |
| 17 | Submission hard-codes `'pending'`; no parameter can set status | same — "hard-codes pending status" | migration | PASS | same |
| 18 | Media is dropped server-side when the admin switch is off | same — "drops attached media when the admin has media switched off" | migration | PASS | same |
| 19 | `get_approved_reviews` returns only approved rows and is bounded | same — "returns only approved reviews", "bounds the result set" | migration | PASS | same |
| 20 | The migration is re-runnable and never drops the table or deletes orders | same — "migration hygiene" | migration | PASS | same |

## Coverage and known gaps

`npm run test:coverage` is **not** wired in this repo (`package.json` defines
only `test` and `test:watch`, and no coverage provider is installed), so no
coverage percentage was produced. The 69 tests above are the measured evidence.

**Not verified — requires a live database.** Every SQL guarantee above is
asserted against the migration *text*, matching this repo's existing convention
(`src/utils/storefrontNoticeMigration.test.ts`). The migration has **not** been
applied to Postgres, so it is not proven to execute. Before merge, run it in the
Supabase SQL editor and confirm:

1. A delivered order number + its matching email returns that order's products.
2. The same order number with a different email returns nothing, with an
   identical generic message.
3. A non-delivered order returns nothing.
4. A tampered `product_id` not in the order is rejected.
5. `curl` against the anon REST endpoint for `product_reviews` is denied, and
   `get_approved_reviews` returns no PII.

**Not built at the time of Part 1.** Superseded by Part 2 below for journeys 3
and 6; the submission form (journeys 1–2) and admin queue (journeys 4–5) remain
outstanding.

**Pre-existing, not caused by this work.**

- `npm run lint` fails repo-wide:
  `TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions'`.
  Reproduced identically on untouched `src/utils/orderTracking.ts`, so it is an
  `@typescript-eslint` version problem, not a defect in these files.
- The pre-change baseline (`npm test`, 10:24) was already
  `Test Files 3 failed | 91 passed (94)`, `Tests 1 failed | 1163 passed (1164)`,
  the named failure being `src/utils/orderHistoryMigrations.test.ts` — untracked
  order-history work from a concurrent session, unrelated to reviews.

**Concurrent-session hazard.** Another Claude Code session committed to this same
branch and working tree during this run (`3b444cd`, `3632a35`, `20df953`,
10:21–10:27), interleaved with these checkpoints. All commits here were staged by
explicit path, and `09f0fa4` is confirmed an ancestor of `HEAD`. The remaining
review work touches `App.tsx`, `AdminDashboard.tsx` and `types/index.ts`, which
that session is also likely to edit; coordinate before continuing.


---

# Part 2 — Public read surface

Delivers journeys **3** (shopper sees only approved reviews with a Verified
Purchase label) and **6** (results-may-vary disclaimer). Journeys 1–2 and 4–5
are still outstanding.

## Task report

### Task 1 — Feature flag (`db3efe9` RED → `5674477` GREEN)

`20260826000100_review_feature_flags.sql` had seeded `feature_reviews_enabled`
before any code read it. Registering `reviews` as the seventh `FeatureId` is
what connects that row to Admin → Features and to `FeatureRoute`.

- **RED**: `npx vitest run src/utils/featureFlags.test.ts` → `Tests 6 failed | 14 passed (20)`.
  Every failure is the absent `reviews` feature; none is setup or syntax.
- **GREEN**: same command → `Tests 20 passed (20)`.

`feature_review_media_enabled` is exported as `REVIEW_MEDIA_SETTING_KEY`, **not**
as a `FeatureId`. It owns no page and no nav entry, so listing it beside the
others would render a navigation toggle and a route leading nowhere. A test
pins it out of `FEATURE_SETTING_KEYS`, and another pins that switching photos
off leaves the review page itself standing.

**Two pre-existing assertions were rewritten**, both counting six features:
`FeatureVisibilityManager` "renders one switch per controllable feature" and
`useFeatureFlags` "leaves the other five features untouched". Each encoded the
old count rather than a behaviour worth keeping; both guarantees now cover the
seventh feature instead of five or six.

### Task 2 — Presentation (`a574d17` RED → `291c2c7` GREEN)

`StarRating`, `ReviewCard`, `ReviewSummary`.

- **RED**: `npx vitest run src/components/reviews` → 3 test files fail to
  resolve their imports; `Tests no tests`. Compile-time RED from the missing
  components.
- **GREEN**: same command → `Tests 22 passed (22)`.

One **test-side** correction, tightening rather than relaxing: the photo case
queried every `role="img"` and caught `StarRating`'s own composite graphic
alongside the two photos. Re-scoped by accessible name; both photo assertions
unchanged.

### Task 3 — Read hook (`4beea67` RED → `d3973ad` GREEN)

- **RED**: `npx vitest run src/hooks/useProductReviews.test.ts` →
  `Failed to resolve import "./useProductReviews"`.
- **GREEN**: same command → `Tests 6 passed (6)`.

### Task 4 — The page (`0241e62` RED → `4bfae96` GREEN)

- **RED**: `npx vitest run src/components/reviews/ReviewsPage.test.tsx` →
  `Failed to resolve import "./ReviewsPage"`.
- **GREEN**: `npx vitest run src/components/reviews` → `Tests 32 passed (32)`.

**A real defect was caught here, not a test-side fix.** The first implementation
mounted `ReviewSummary` unconditionally. That component renders "No reviews yet"
for any empty list, so the page asserted the shop had no reviews *while still
loading* and *after a failed read* — telling a shopper something false about the
business whenever the network hiccuped. The summary and filter now wait for the
read to settle, keeping loading, failed and empty as three visibly distinct
states.

### Task 5 — Route and navigation (`fb65f51` RED → `f0a2956` GREEN)

- **RED**: `npx vitest run src/utils/storefrontNotice.test.ts src/components/Header.test.tsx`
  → `Tests 2 failed | 36 passed (38)`.
- **GREEN**: full suite → `Tests 1500 passed (1500)`.

**Placement decision.** Reviews joins the **side navigation**, not the bottom
bar. `StorefrontBottomNav` allows six columns — Home, Shop, Cart plus Lab
Reports, Orders, Guides — and is already at that maximum; a seventh would leave
every tab too narrow to hit on a phone. Item 3 of the client's brief places
feature entries in the side navigation, which `NAV_ITEMS` drives for both the
desktop bar and the drawer at once.

Adding the `reviews` notice page id makes `PAGE_LABELS`
(`Record<NoticePageId, string>`) incomplete until its admin label is supplied,
so the compiler catches the omission instead of the notice editor rendering a
blank checkbox.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 21 | Reviews is the seventh feature, keyed to the row its migration seeded | `src/utils/featureFlags.test.ts` — "covers exactly the seven", "reads Customer Reviews from the key its migration already seeded" | unit | PASS | `npx vitest run src/utils/featureFlags.test.ts` |
| 22 | The photo switch is not a navigation feature and cannot take the page down | same — "leaves the review MEDIA switch out", "keeps reviews visible when only the media switch is off" | unit | PASS | same |
| 23 | A score is readable as text, not only as filled shapes | `src/components/reviews/StarRating.test.tsx` — "states the score in text" | unit | PASS | `npx vitest run src/components/reviews` |
| 24 | The rating input is a real radiogroup, settable from the keyboard alone | same — "exposes one radio per star", "can be reached and set from the keyboard alone" | unit | PASS | same |
| 25 | **A review card never renders reviewer identity, even from an over-wide row** | `src/components/reviews/ReviewCard.test.tsx` — "NEVER renders reviewer identity" | unit | PASS | same |
| 26 | Every card carries a Verified Purchase badge and the exact variation reviewed | same — "carries a Verified Purchase badge", "names the exact product and variation" | unit | PASS | same |
| 27 | A blank pseudonym falls back to "Verified Customer", never to a real name | same — "falls back to the anonymous label" | unit | PASS | same |
| 28 | An absent shop reply renders no reply block at all | same — "omits the reply block entirely" | unit | PASS | same |
| 29 | The summary shows a per-star histogram and singularises "1 review" | `src/components/reviews/ReviewSummary.test.tsx` | unit | PASS | same |
| 30 | An empty list invites the first review rather than presenting 0.0 | same — "invites the first review" | unit | PASS | same |
| 31 | Reviews are read through `get_approved_reviews`, never the table | `src/hooks/useProductReviews.test.ts` — "reads through the RPC, never the table" | unit | PASS | `npx vitest run src/hooks/useProductReviews.test.ts` |
| 32 | A failed read empties the list rather than leaving a stale one under an error | same — "surfaces a readable error and empties the list" | unit | PASS | same |
| 33 | The hook refetches on product change but not on every render | same — "refetches when the product changes", "does not refetch on every render" | unit | PASS | same |
| 34 | The client's disclaimer appears verbatim, including on an empty page | `src/components/reviews/ReviewsPage.test.tsx` — "carries the medical disclaimer verbatim", "shows the disclaimer even when there are no reviews yet" | unit | PASS | same |
| 35 | **Loading, failed and empty are three distinct states** | same — "says it is loading", "distinguishes a failed load from having no reviews" | unit | PASS | same |
| 36 | The summary describes the filtered list, not the whole one | same — "recomputes the summary from the filtered set" | unit | PASS | same |
| 37 | Each product appears once in the filter however many reviews it has | same — "lists each product once in the filter" | unit | PASS | same |
| 38 | Customer Reviews appears in the side nav and disappears when switched off | `src/components/Header.test.tsx` — "shows every side-nav entry", "drops Customer Reviews from the side nav" | unit | PASS | `npx vitest run src/components/Header.test.tsx` |
| 39 | The reviews page can be targeted by a storefront notice like every other public page | `src/utils/storefrontNotice.test.ts` — "covers the Customer Reviews page" | unit | PASS | `npx vitest run src/utils/storefrontNotice.test.ts` |

## Coverage and known gaps

**Suite**: `npx vitest run` → `Tests 1500 passed (1500)`, up from the
pre-change baseline of `1457 passed`. 43 new tests, all passing.

**Typecheck**: `npx tsc --noEmit -p tsconfig.app.json` → 58 errors, **identical
in count and location to the pre-change baseline**; none in any file touched
here. (A bare `tsc --noEmit` exits 0 while checking zero files — the `-p` flag
is required.)

**Still not built at the time of Part 2.** The admin queue landed in Part 3.
`ReviewForm` / `useReviewSubmission` (journeys 1–2) and reviews on
`ProductDetailModal` remain outstanding.

**Business rule confirmed with the client, not yet exercised against live data.**
`get_reviewable_order` requires `order_status = 'delivered'`: a customer cannot
review until their order is marked delivered. The brief said "successfully
ordered", which is looser. Delivered-only is already in the shipped SQL and is
the defensible reading.

**Pre-existing, not caused by this work.**

- Two orphaned test files fail to collect on every run, before and after these
  changes: `src/utils/checkoutPrefill.test.ts` and
  `src/hooks/useReturningCustomer.test.ts` both import implementations that have
  never existed in git history. They account for the `2 failed` test **files**
  alongside `1500 passed` tests.
- `npm run lint` fails repo-wide with
  `TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions'`.
  Reproduced identically on untouched `src/utils/currency.ts`, so it is an
  `@typescript-eslint` version problem rather than a defect in these files.
- The working tree carried ~34 modified files from earlier sessions throughout
  this run. Every commit here was staged by explicit path; none of that work was
  swept into these checkpoints.


---

# Part 3 — Admin moderation queue

Delivers journeys **4** (admin privately verifies identity against the order)
and **5** (approve, reject, hide, delete, reply). Journeys 1–2 — the customer's
submission form — remain the only outstanding piece of the feature.

## Task report

### Task 1 — `useAdminReviews` (`57016fb` RED → `432ff38` GREEN)

- **RED**: `npx vitest run src/hooks/useAdminReviews.test.ts` →
  `Failed to resolve import "./useAdminReviews"`.
- **GREEN**: same command → `Tests 10 passed (10)`.

This hook reads `product_reviews` **directly**, the opposite of
`useProductReviews`. The asymmetry is the design: RLS confines the table to
`public.is_admin()`, there is no moderation RPC, and this is the one surface
where reviewer identity is *meant* to be visible.

`moderated_at` and `moderated_by` are stamped inside a single `patch()` helper
rather than at each call site, so a moderation action added later cannot ship
without them. The table has no `updated_at` trigger, so that is maintained here
too. A failed `auth.getUser()` degrades the stamp to `null` instead of blocking
moderation — being unable to name the admin is not a reason to leave a review
stuck in the queue.

### Task 2 — `ReviewsAdminManager` + dashboard wiring (`bba0e6f` RED → `9a79e23` GREEN)

- **RED**: `npx vitest run src/components/reviews/ReviewsAdminManager.test.tsx` →
  `Failed to resolve import "./ReviewsAdminManager"`.
- **GREEN**: same command → `Tests 15 passed (15)`, passing on the first run.

Opens on Pending, the only tab holding work. Reviewer name, email, phone and
order number sit in a bordered block labelled **"Verification · not shown
publicly"**, a few lines below the public pseudonym the same card displays —
an admin who cannot separate the two at a glance is one paste away from putting
a customer's real name into a public reply. Delete is confirmation-gated and its
copy points at Hide as the reversible alternative, because there is no undo and
no audit table for reviews.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 40 | The admin queue loads every review newest-first with identity intact | `src/hooks/useAdminReviews.test.ts` — "loads every review, newest first" | unit | PASS | `npx vitest run src/hooks/useAdminReviews.test.ts` |
| 41 | **Moderating stamps who and when, not just the new status** | same — "stamps who moderated and when", "carries the same stamp through reject and hide" | unit | PASS | same |
| 42 | A lost admin session degrades the stamp to null rather than blocking moderation | same — "still moderates when the admin identity cannot be read" | unit | PASS | same |
| 43 | **Replying never writes status**, so answering a pending review cannot publish it | same — "records a reply without changing the status" | unit | PASS | same |
| 44 | An all-whitespace reply clears to null, not `''` | same — "clears a reply back to null" | unit | PASS | same |
| 45 | A failed write throws rather than reporting success | same — "propagates a write failure" | unit | PASS | same |
| 46 | The queue refetches after a write so it cannot drift from the database | same — "refetches after a successful write" | unit | PASS | same |
| 47 | The screen opens on Pending and counts what is waiting | `src/components/reviews/ReviewsAdminManager.test.tsx` — "opens on Pending", "counts what is waiting" | unit | PASS | `npx vitest run src/components/reviews/ReviewsAdminManager.test.tsx` |
| 48 | **Reviewer identity is labelled "not shown publicly"** beside the public pseudonym | same — "marks that identity as private", "shows the public pseudonym alongside" | unit | PASS | same |
| 49 | Approve, reject and hide each dispatch the right status | same — "approves", "rejects", "hides a review that is already public" | unit | PASS | same |
| 50 | **Delete does not call through when the admin backs out of the confirm** | same — "confirms before deleting" | unit | PASS | same |
| 51 | A failed action surfaces instead of looking like it worked | same — "surfaces a failed action" | unit | PASS | same |
| 52 | Loading, failed and empty are three distinct states in the queue too | same — "says the queue is clear", "distinguishes a failed load" | unit | PASS | same |

## Coverage and known gaps

**Suite**: `npx vitest run` → `Test Files 2 failed | 123 passed (125)`,
`Tests 1525 passed (1525)`. 25 new tests over Part 2's 1500; zero failing tests.
The two failing **files** are the long-standing orphans described above.

**Typecheck**: `npx tsc --noEmit -p tsconfig.app.json` → 58 errors, unchanged in
count from the pre-change baseline. The three reported against `AdminDashboard`
are the same pre-existing three, shifted by the inserted view.

**A methodology note worth keeping.** Two intermediate full-suite runs reported
5 and then 23 failing tests across `Checkout`, `OrderItemsEditor` and others.
Both were artefacts of **concurrent `vitest run` invocations competing for CPU**
— several runs had been launched in the background and left overlapping. Each
named file passed in isolation, the failure set differed between runs, and a
single clean run with no other vitest process reported `1525 passed (1525)`.
When judging this suite, run it **once, alone**; overlapping runs manufacture
timeouts that read convincingly like regressions.

**Still not built.** `ReviewForm` and its `useReviewSubmission` hook (journeys
1–2), and approved reviews surfaced on `ProductDetailModal`. The moderation
queue now exists, so the form is safe to build next: submissions will land in
Pending and have somewhere to be approved from.


---

# Part 4 — Customer submission form

Delivers journeys **1** (prove a purchase, review only what was bought) and
**2** (choose any display name, stay private). With these, all six journeys
have a working surface.

## Task report

### Task 1 — `useReviewSubmission` (`1c30472` RED → `bc87d38` GREEN)

- **RED**: `npx vitest run src/hooks/useReviewSubmission.test.ts` →
  `Failed to resolve import "./useReviewSubmission"`.
- **GREEN**: same command → `Tests 12 passed (12)`.

The hook holds the proven order number and email and replays them on submit.
`submit_product_review` accepts **no order id** — it re-derives the order from
those raw values every time — so caching an id would produce something the
server will not take.

**One generic message covers every failed verification.**
`get_reviewable_order` returns zero rows for a wrong email, an unknown order and
an undelivered order alike. A message naming which half was wrong would rebuild
the "has this address ever ordered here" oracle the SQL was written to deny, so
the test asserts one message and forbids the words that would leak the
distinction. A lookup that merely *failed* gets different wording — telling
someone their order does not exist when the network dropped sends them away for
good.

### Task 2 — `ReviewForm` (`fcb2d12` RED → `477239a` GREEN)

- **RED**: `npx vitest run src/components/reviews/ReviewForm.test.tsx` →
  `Failed to resolve import "./ReviewForm"`.
- **GREEN**: same command → `Tests 15 passed (15)`, passing on the first run.

Two steps: the rating and body do not render until an order is proven, because
showing them first invites a customer to write a full review and only then
discover they cannot post it. The confirmation says the review was sent **for
approval** — every review is born `pending`, so "your review is up" would send
the customer looking for something that is not on the page.

### Task 3 — Page wiring (`d9e6db7` GREEN)

- **RED**: `npx vitest run src/components/reviews/ReviewsPage.test.tsx` →
  `Tests 3 failed | 10 passed (13)`.
- **GREEN**: `npx vitest run src/components/reviews` → `Tests 65 passed (65)`.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 53 | Verification normalises order number and email the way the SQL does | `src/hooks/useReviewSubmission.test.ts` — "sends the order number and email to the verification RPC" | unit | PASS | `npx vitest run src/hooks/useReviewSubmission.test.ts` |
| 54 | **A wrong email and an unknown order produce one identical message** | same — "treats a wrong email and an unknown order identically" | unit | PASS | same |
| 55 | A failed lookup is worded differently from "no such order" | same — "surfaces a lookup failure without claiming the order is unknown" | unit | PASS | same |
| 56 | No review can be submitted before an order is proven | same — "never sends a review before an order has been proven" | unit | PASS | same |
| 57 | Photos are dropped client-side when the admin switch is off, and the switch fails open | same — "drops photos when the admin has the photo switch off", "leaves photos enabled when the setting row is missing" | unit | PASS | same |
| 58 | A rejection surfaces the database's own wording | same — "surfaces the database message when submission is rejected" | unit | PASS | same |
| 59 | **The rating and body are not shown until the order is proven** | `src/components/reviews/ReviewForm.test.tsx` — "asks only for the order number and email up front" | unit | PASS | `npx vitest run src/components/reviews/ReviewForm.test.tsx` |
| 60 | **The confirmation says "awaiting approval", never that the review is live** | same — "says the review is awaiting approval" | unit | PASS | same |
| 61 | A product this order already reviewed is offered but disabled | same — "blocks a product this order already reviewed" | unit | PASS | same |
| 62 | The anonymity promise sits beside the display-name field | same — "promises anonymity next to the display name field" | unit | PASS | same |
| 63 | The photo control disappears entirely when photos are switched off | same — "hides the photo control" | unit | PASS | same |
| 64 | The form is opt-in, and offered even with no reviews yet | `src/components/reviews/ReviewsPage.test.tsx` — "keeps the form behind a button", "still offers the form when there are no reviews yet" | unit | PASS | `npx vitest run src/components/reviews` |

## Coverage and known gaps

**Reviews subsystem**: `npx vitest run src/components/reviews` →
`Tests 65 passed (65)`, plus 12 (`useReviewSubmission`), 10 (`useAdminReviews`)
and 6 (`useProductReviews`) at the hook level. Every review test passes on
every run.

**Typecheck**: `npx tsc --noEmit -p tsconfig.app.json` → 58 errors, unchanged
from the pre-change baseline; none in any review file.

### ⚠ The suite is now load-sensitive — read this before trusting a red run

Full-suite runs no longer come back clean, and **the failing set differs every
time**:

| Run | Result |
|---|---|
| Before Part 4 | `1525 passed (1525)` — clean |
| After Part 4, run 1 | `1 failed \| 1554 passed` — `Checkout` "bills items only online…" |
| After Part 4, run 2 | `4 failed \| 1551 passed` — three other `Checkout` cases + `useCart.server` |

Every failure is `Error: Test timed out in 5000ms`, and every named file passes
in isolation: `Checkout.test.tsx` + `useCart.server.test.ts` together give
`42 passed (42)`.

**Diagnosis — not caused by the review code, but exposed by it.** Those two
files were already close to the 5 s default: 42 tests take **7.77 s** with the
machine otherwise idle. `Checkout.test.tsx` also logs
`supabase.from(...).select(...).order is not a function` and
`...maybeSingle is not a function` from `useStickers` and `useCodAvailability`,
so its mocks are incomplete and parts of the component run their error paths on
every render. Part 4 added 30 tests, and the extra parallel load is enough to
push the slowest of them past the timeout. No review file is involved in any
failure, and no review test has ever failed.

**Two honest options, neither taken here** because both change shared config or
unrelated tests, which is the user's call:

1. Raise `testTimeout` in `vite.config.ts` (currently the 5 s default). One
   line, but it masks genuinely slow tests rather than fixing them.
2. Complete the supabase mocks in `Checkout.test.tsx` so `useStickers` and
   `useCodAvailability` resolve instead of throwing. Slower to do, and fixes
   the actual cause.

**Still not applied to a live database.** Every SQL guarantee in Part 1 is
asserted against the migration *text*. Neither
`20260826000000_customer_reviews.sql` nor
`20260826000100_review_feature_flags.sql` has been run against Postgres, so the
RPCs are not proven to execute. Until they are, `/reviews` renders empty and the
admin queue stays blank. The Part 1 checklist of live checks still stands.

**Still not built.** Approved reviews on `ProductDetailModal` — the review page
carries them, individual product pages do not.
