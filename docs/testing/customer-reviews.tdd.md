# TDD Evidence — Customer Reviews (data layer)

**Source plan**: produced inline via `/ecc:plan` in this session (no `*.plan.md` artifact was written).
**Branch**: `feat/pay-now-cod-payment-options`
**Checkpoints**: `09f0fa4` (RED), `5ecca26` (GREEN), `092ef68` (RED), `d4d3c14` (GREEN)
**Status**: data layer complete. UI (hooks, public page, admin queue, route/nav
integration) is **not** built — see "Known gaps".

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

**Not built.** `useReviews` / `useReviewAdmin` hooks, the `/reviews` page,
`ReviewSubmitForm`, `ReviewCard`, `ProductReviews`, `ReviewsManager`, and the
`App.tsx` / `AdminDashboard.tsx` / `ProductDetailModal.tsx` / `featureFlags.ts`
integrations. Journeys 3–5 therefore have no user-facing surface yet.

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
