# TDD Evidence — Unique Members + Top-Buyer Analytics (Group Buy)

**Source plan:** conversational `/ecc:tdd-workflow` request (this session). No `*.plan.md` file.
**Date:** 2026-07-04

## User Journeys
1. As an admin, I want the batch members roster to show only unique emails (one row per person) so a member who re-submitted or changed tiers is not double-counted.
2. As an admin, I want the members summary to count unique emails so "N members" reflects real people, not raw access-request rows.
3. As an admin, I want to see the top buyers of the batch ranked by total product spend (grouped by email) so I can recognize the biggest customers.

## Design Decisions (confirmed with user)
- **Top buyer metric:** total product spend — sum of `BatchOrder.total_price` per `customer_email`, cancelled orders excluded.
- **Dedupe rule:** prefer unlocked, latest — one row per email; an `approved` (unlocked) request beats a `pending` one, and within a status the most recent request wins.

## Task Report
| Task | Summary | Validation | RED → GREEN | Guarantee |
|---|---|---|---|---|
| Pure analytics util | `uniqueMembersByEmail` + `topBuyersByEmail` in `src/utils/batchMemberAnalytics.ts` | `npx vitest run src/utils/batchMemberAnalytics.test.ts` | 0 run / import fail (module missing) → 14 passed | Roster collapses to unique emails; buyers ranked by spend; input not mutated |
| Members panel | `BatchMembersPanel` de-dupes rows, shows unique count, renders top-buyer leaderboard | `npx vitest run src/components/groupbuy/BatchMembersPanel.test.tsx` | 3 failed → 11 passed | Duplicate emails render once; count reads "N unique members"; leaderboard shown only when `topBuyers` provided |
| Container wire | `GroupBuyManager` computes `topBuyersByEmail(orders)` and passes it to the panel | `npx tsc --noEmit` | n/a (typecheck) | Leaderboard fed from live batch orders |

## Test Specification
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Already-unique roster is unchanged | `batchMemberAnalytics.test.ts:uniqueMembersByEmail > returns one row per email` | unit | PASS |
| 2 | Duplicate emails collapse to one | `uniqueMembersByEmail > collapses duplicate emails into a single member` | unit | PASS |
| 3 | Email match is case-insensitive | `uniqueMembersByEmail > treats emails case-insensitively` | unit | PASS |
| 4 | Approved request wins over pending | `uniqueMembersByEmail > prefers the approved (unlocked) request` | unit | PASS |
| 5 | Latest wins when none approved | `uniqueMembersByEmail > uses the latest request when none are approved` | unit | PASS |
| 6 | Latest approved wins among approved | `uniqueMembersByEmail > uses the latest approved request` | unit | PASS |
| 7 | Buyers ranked by spend desc | `topBuyersByEmail > ranks buyers by total product spend` | unit | PASS |
| 8 | Same email's orders are summed | `topBuyersByEmail > sums multiple orders from the same email` | unit | PASS |
| 9 | Buyer grouping is case-insensitive | `topBuyersByEmail > groups case-insensitively by email` | unit | PASS |
| 10 | Cancelled orders excluded | `topBuyersByEmail > excludes cancelled orders from the totals` | unit | PASS |
| 11 | Leaderboard limited to N | `topBuyersByEmail > limits the leaderboard to the requested size` | unit | PASS |
| 12 | Null total_price treated as 0 | `topBuyersByEmail > treats a null total_price as zero` | unit | PASS |
| 13 | Unique count in summary line | `BatchMembersPanel.test.tsx:summarizes unique, unlocked, and awaiting-review counts` | component | PASS |
| 14 | Duplicate email renders one row | `BatchMembersPanel > collapses duplicate emails into one row` | component | PASS |
| 15 | Leaderboard renders when provided | `BatchMembersPanel > renders a top-buyers leaderboard when topBuyers are provided` | component | PASS |
| 16 | No leaderboard when omitted | `BatchMembersPanel > renders no leaderboard when topBuyers is omitted` | component | PASS |

## Coverage & Known Gaps
- Full suite: **592 passed / 53 files** (`npx vitest run`). Typecheck clean (`npx tsc --noEmit`).
- New pure util is fully unit-covered (all branches: empty input, dedupe preference, case-folding, cancelled exclusion, null money, limit).
- Not covered by automated tests (consistent with repo conventions): the `GroupBuyManager` wiring (verified by typecheck).
- `npm run lint` is currently broken repo-wide (`@typescript-eslint/no-unused-expressions` throws on load) — pre-existing, reproduces on untouched files; not introduced here.

## RED → GREEN Summary
- Util: import failure (module missing) → **14 passing** after implementing `batchMemberAnalytics.ts`.
- Panel: **3 failing** (unique count, dedupe row, leaderboard) → **11 passing** after wiring dedupe + leaderboard into `BatchMembersPanel`.
