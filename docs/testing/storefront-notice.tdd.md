# TDD Evidence — Storefront "Important Notice" Modal

**Source plan:** none. Journeys were derived during this TDD run from a screenshot of the desired
modal plus the request: *"every refresh there's going to be a pop up modal like this and all of the
contents in this modal is going to be editable in the admin page."*

## User journeys

1. As a shopper, when I load the storefront, I see an Important Notice I must acknowledge before
   browsing — and it comes back on every refresh, exactly as its own footer promises.
2. As an admin, I can edit every string in that notice (title, subtitle, body, highlight strip,
   policy card, button label, footer note) and turn the notice off entirely, and shoppers see my
   changes on their next visit.

## Task report

| Task | Summary | Validation command | Result |
|---|---|---|---|
| Notice data model | `site_settings`-backed notice: absent row → default, present row wins verbatim (blank clears a section) | `npx vitest run src/utils/storefrontNotice.test.ts` | RED (module missing) → **18 passed** |
| Fetch/save hook | `useStorefrontNotice` reads only the notice keys, falls back to defaults on any failure, upserts all keys on save | `npx vitest run src/hooks/useStorefrontNotice.test.ts` | RED (module missing) → **7 passed** |
| Modal | Blocking dialog, admin strings, optional sections omitted when blank | `npx vitest run src/components/StorefrontNoticeModal.test.tsx` | RED (module missing) → **14 passed** |
| Modal preview mode | Admin preview must not steal focus or expose a second dialog | same as above | RED (3 failed) → **17 passed** total |
| Storefront gate | Shows once loaded/enabled, hides on acknowledge, never persists | `npx vitest run src/components/StorefrontNoticeGate.test.tsx` | RED (module missing) → **5 passed** |
| Admin editor | Prefills, edits, toggles, saves, reports success/failure, live preview | `npx vitest run src/components/StorefrontNoticeManager.test.tsx` | RED (module missing) → **8 passed** |

RED evidence (first run, all five suites): `Failed to resolve import "./storefrontNotice"` /
`"./StorefrontNoticeModal"` etc. — `Test Files 5 failed (5)`, `Tests no tests`.

GREEN evidence (`npm test`, full suite): `Tests 852 passed (852)`, up from `797 passed` on a clean
tree — 55 new tests, zero regressions.

## Test specification

| # | What is guaranteed | Test file / name | Type | Result |
|---|---|---|---|---|
| 1 | Body text splits into paragraphs on blank lines; policy text into lines; blanks dropped | `src/utils/storefrontNotice.test.ts:splitParagraphs / splitLines` | unit | PASS |
| 2 | A fresh install with no stored rows renders the seeded default notice | `…:noticeFromSettings returns the defaults when no rows exist` | unit | PASS |
| 3 | Only an explicit `'false'` disables the notice; a missing flag means enabled | `…:is disabled only when the flag is the string "false"` | unit | PASS |
| 4 | An admin can clear an optional section by saving it blank | `…:lets an admin clear a section with an explicit empty value` | unit | PASS |
| 5 | Saved content round-trips through storage without loss | `…:round-trips through noticeFromSettings` | unit | PASS |
| 6 | The hook queries only the nine notice keys, not all site settings | `src/hooks/useStorefrontNotice.test.ts:reads only the notice keys` | integration | PASS |
| 7 | A failed or throwing settings query still shows the default disclaimer | `…:falls back to the defaults when the query fails / throws` | integration | PASS |
| 8 | Saving upserts every key and surfaces the DB error message on failure | `…:upserts every notice key on save`, `…:rejects and surfaces an error` | integration | PASS |
| 9 | The modal renders every admin-editable string from the screenshot | `src/components/StorefrontNoticeModal.test.tsx:renders …` (6 tests) | unit | PASS |
| 10 | It is an accessible modal dialog, labelled by its title, focused on the agree button | `…:exposes an accessible modal dialog`, `…:moves focus to the agree button` | unit | PASS |
| 11 | Escape does not dismiss it — acknowledgement is required | `…:cannot be dismissed with Escape` | unit | PASS |
| 12 | Blank optional fields omit their section instead of rendering an empty box | `…:omits the highlight strip / policy card / subtitle and footer note` | unit | PASS |
| 13 | The admin preview is inert: no dialog role, no focus theft, no click-through | `…:preview mode` (3 tests) | unit | PASS |
| 14 | The notice appears on every visit and is hidden while loading or when disabled | `src/components/StorefrontNoticeGate.test.tsx` | integration | PASS |
| 15 | Acknowledging hides it, and nothing is written to localStorage, so a refresh re-shows it | `…:does not persist the acknowledgement` | integration | PASS |
| 16 | The admin form prefills from storage, saves edits and the on/off toggle, and reports outcome | `src/components/StorefrontNoticeManager.test.tsx` (8 tests) | integration | PASS |

## Coverage and known gaps

- No instrumented coverage number: the repo has no `test:coverage` script and `@vitest/coverage-v8`
  is not installed. Adding a dev dependency was out of scope for this change, so coverage is
  reported as behavioral rather than line-based — every exported function, every branch of the
  defaults/blank/absent rules, both hook failure paths, and each optional modal section has a
  dedicated test.
- Not covered by automated tests: the two wiring edits (`src/App.tsx` renders `StorefrontNoticeGate`,
  `SiteSettingsManager` renders `StorefrontNoticeManager`). Both are single-line composition and are
  verified by `npm run build` (`✓ built in 7.87s`) and by `tsc`.
- Pre-existing failures, unrelated and unchanged by this work: `src/utils/checkoutPrefill.test.ts`
  and `src/hooks/useReturningCustomer.test.ts` import source modules that do not exist in the repo.
  Verified identical on a stashed clean tree (`2 failed | 66 passed`).
- Pre-existing type errors: `npx tsc -b --noEmit` reports 103 errors before and after this change;
  none are in the new files.
- Migration `supabase/migrations/20260721000000_storefront_notice.sql` is not exercised by tests. It
  is idempotent (`ON CONFLICT DO NOTHING`) and the client defaults match it exactly, so the feature
  behaves correctly whether or not it has been applied.
