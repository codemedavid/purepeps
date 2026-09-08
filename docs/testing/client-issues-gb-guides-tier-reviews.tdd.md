# TDD evidence — GB status, Guides, tier and review lookup

**Branch:** `feat/gb-landing-homepage`
**Source plan:** none on disk. The work came from a client WhatsApp thread
(paraphrased from Tagalog) plus a Guides screenshot and a screen recording,
restated as journeys below.

## User journeys

1. As the shop owner, I want to set the Group Buy status and timeline myself,
   so I can announce "GB OPEN" without waiting for a deploy.
2. As a shopper, I want the Guides page to actually list protocols, so it is
   not an empty page with a filter on top of nothing.
3. As the shop owner, I want to add a protocol to "Weight Loss" without
   creating a second "Weight Loss" in the public dropdown.
4. As a shopper, I want to search the protocols by peptide name, so I can find
   one without reading the whole list.
5. As a paid member, I want to see which tier I hold, so I know what my payment
   bought me.
6. As a verified buyer, I want the review form to tell me something true about
   MY order, so I am not sent to re-check details that were already correct.

## What was actually wrong

Four reports, four different causes. Two were not what the report implied.

| Report | Actual cause |
|---|---|
| "Paano i-edit ung GB timeline / RQ ko na GB will be open" | **Nothing broken.** The editor already exists (Admin → Settings → Group Buy Landing, 34 fields incl. `status_mode` = auto/open/closed). The client did not know where it was. |
| "0 protocol(s) found" | `protocols` held **0 rows**. Plus two code faults that would have hidden rows even once seeded. |
| "Tigdadalawa lumabas" (duplicate categories) | Dropdown was `new Set(p.category)` over raw free text — one option per distinct STRING, not per category. |
| "Nawala po ata ung tier ko" | `tierName` was passed to `Menu` from `App` and **never rendered** — an unused prop since tiered access shipped in `00d0a8c`. The stored tier was never lost. |
| "Nagloloko ung review" | The order was not `delivered` at the time. `get_reviewable_order` returns zero rows for unknown-order, wrong-email AND not-delivered-yet, and all three produced the same dead-end message. |

## Task report

| Task | Execution | Validation actually run | RED | GREEN |
|---|---|---|---|---|
| A. GB status | No code change — verified existing | 4 suites, per file | n/a (already green) | gbLanding 32, useGbLanding 5, GbLandingManager 8, GroupBuyLanding 24 |
| B1. Empty protocols | `supabase/migrations/20260908000000_seed_protocol_guides.sql`, 15 protocols, idempotent per name | applied via MCP, then `select category, count(*)` | table had 0 rows | 15 rows across 10 raw category strings |
| B2. Duplicate categories | new `src/utils/protocolCategories.ts` | `npx vitest run src/utils/protocolCategories.test.ts` | unresolved import, no tests ran | 32 passed (32) |
| B3. Search + wiring | `ProtocolGuide.tsx` | `npx vitest run src/components/ProtocolGuide.test.tsx` | 7 failed \| 19 passed (26) | 26 passed (26) |
| B4. Admin picker | `ProtocolManager.tsx` | `npx vitest run src/components/ProtocolManager.test.tsx` | 6 failed (27) | 27 passed (27) |
| C. Tier badge | `Menu.tsx` | `npx vitest run src/components/Menu.test.tsx` | 3 failed \| 2 passed (5) | 5 passed (5) |
| D1. Status message | `utils/reviews.ts` | `npx vitest run src/utils/reviews.test.ts` | 12 failed \| 37 passed (49) | 49 passed (49) |
| D2. Status RPC + hook | `20260908000100_get_order_review_status.sql`, `useReviewSubmission.ts` | `npx vitest run src/hooks/useReviewSubmission.test.ts` | 5 failed \| 13 passed (18) | 18 passed (18) |
| D3. Identity prefill | `reviews/ReviewForm.tsx` | `npx vitest run src/components/reviews/ReviewForm.test.tsx` | 2 failed \| 18 passed (20) | 20 passed (20) |

**Full suite:** `npx vitest run` → **1840 passed (1840)**, `2 failed | 140 passed (142)` files.
The two failing FILES — `useReturningCustomer.test.ts`, `checkoutPrefill.test.ts` —
are pre-existing orphans that fail to resolve `./checkoutPrefill`; they run zero
tests, are untouched by this work, and were last committed in `bbb47eb`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | "Weight Loss", "weight loss", "  WEIGHT   LOSS  " and "Weight-Loss" are ONE category | `protocolCategories.test.ts:collapses the case, spacing and punctuation` | unit | PASS |
| 2 | Legacy labels ("Weight Management", "Skin & Anti-Aging") fold onto the canonical entry | `protocolCategories.test.ts:folds known synonyms` | unit | PASS |
| 3 | An unrecognised category is kept, not discarded | `protocolCategories.test.ts:keeps an unrecognised category` | unit | PASS |
| 4 | One protocol can sit in several categories via a comma list | `protocolCategories.test.ts:lets one protocol sit in several categories` | unit | PASS |
| 5 | A file/image protocol is shown despite having no dosing text | `protocolCategories.test.ts:shows a file protocol even though it has no dosing text` | unit | PASS |
| 6 | A file protocol with no file attached stays hidden | `protocolCategories.test.ts:hides a file protocol with no file attached` | unit | PASS |
| 7 | The dropdown never repeats a category, however it was spelled | `ProtocolGuide.test.tsx:never repeats a category` | component | PASS |
| 8 | Search narrows the list; clearing it restores the full list | `ProtocolGuide.test.tsx:restores the full list when the query is cleared` | component | PASS |
| 9 | Search and category combine (AND, not reset) | `ProtocolGuide.test.tsx:combines the search box with the category dropdown` | component | PASS |
| 10 | "No protocols" is only said when the shop truly has none | `ProtocolGuide.test.tsx:says the shop has no protocols yet only when it really has none` | component | PASS |
| 11 | Editing a legacy-labelled protocol pre-selects the canonical chip | `ProtocolManager.test.tsx:populates form with protocol data` | component | PASS |
| 12 | A verified member sees their tier named on the catalog | `Menu.test.tsx:names the verified member tier` | component | PASS |
| 13 | No tier chip for an unverified shopper, or while the grant is still loading | `Menu.test.tsx:keeps the badge off when access is verified but no tier came back` | component | PASS |
| 14 | A real order that is not delivered gets its actual status named | `reviews.test.ts:names the order's real status` | unit | PASS |
| 15 | A wrong email and an unknown order stay byte-identical | `useReviewSubmission.test.ts:keeps the generic message when the order truly does not match` | unit | PASS |
| 16 | A failure of the status question falls back to the generic message | `useReviewSubmission.test.ts:falls back to the generic message when the status question itself fails` | unit | PASS |
| 17 | No status question is asked when the order was reviewable all along | `useReviewSubmission.test.ts:does not ask for a status when the order was reviewable` | unit | PASS |
| 18 | The lookup message never echoes an email address | `reviews.test.ts:never echoes an email address back to the reader` | unit | PASS |
| 19 | The form prefills order number and email from this device | `ReviewForm.test.tsx:prefills the order number from the most recent saved order` | component | PASS |
| 20 | A prefilled field can still be overwritten | `ReviewForm.test.tsx:lets the customer overwrite what was prefilled` | component | PASS |

## Live verification (dev server + real database)

| Check | Result |
|---|---|
| Guides, All Categories | **15 protocol(s) found**, 9 options, `duplicateSlugs: []` |
| Weight Loss / Fat Dissolvers / Anti Aging present once each | yes — (5), (5), (5) |
| Search "tirze" → clear | 1 → 15 |
| Fat Dissolvers + "tirze" | 0, with "No protocols match your search or category" |
| Tier badge, catalog | "YOUR TIER / Peptides only"; SKINBOOSTER correctly locked |
| Reviews: `TBS-100740-4243` + `adminpretty@gmail.com` | form opens with Tirzepatide 60mg, 5-Amino-1MQ 50mg, TIRZEPATIDE SALTFORM 15mg |
| Reviews: real order `TBS-100739-8097` (status `new`) + its correct email | *"We found that order — it is currently \"New\". Reviews unlock once an order is marked Delivered…"* |
| Reviews: same order, wrong email | generic not-found |
| Reviews: non-existent order | **byte-identical** to the wrong-email message |
| Mobile 390×844 | one bottom nav (Home/Shop/Orders/Guides/Labs/Reviews), no overflow |

## Security note on the new RPC

`get_order_review_status` returns a status ONLY when the order number and the
email match the same row, so the wrong-email and unknown-order cases stay
indistinguishable and the form is not an oracle for "has this address ever
ordered here". This was verified live, above. It is also strictly less than what
is already public: `get_orders_by_email` (20260712000000) returns `order_status`
from the **email alone**, with no order number required.

No PII was added to any public surface. The review row's identity columns still
never reach `get_approved_reviews`, and the form's prefill is read from this
device's own localStorage.

## Known gaps / follow-ups

1. **Tier display is empty between group buys, by design.** Access is per-batch:
   `get_access_grant` resolves against the OPEN batch, so with batch 34 closed
   (10:30 today) the reporting account returns `status: none, tier_name: null`
   even though `access_requests` still holds `approved` + tier "Peptides only".
   Nothing was lost — but the badge will be blank until a batch is open. Making
   it read "Batch 34 · Peptides only — renew for the next buy" between buys is a
   product decision, not a bug fix, so it was not taken unilaterally.
2. **`auto` GB status depends on an open batch.** With no batch open the badge
   reads CLOSED, which is correct. To announce a buy before opening one, set
   `status_mode` to `open` in Admin → Settings → Group Buy Landing.
3. The two orphan test files remain; deleting or restoring them is out of scope
   here.
