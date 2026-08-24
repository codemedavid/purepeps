# TDD Evidence — Ligwak (incomplete-kit allocation & refunds) for Group Buy

**Source plan:** conversational `/ecc:plan` output (this session), confirmed by the user with "yes". No `*.plan.md` file.
**Date:** 2026-08-24
**Branch:** `feat/pay-now-cod-payment-options`

"Ligwak" = a vial left behind in an incomplete kit when a group buy closes. When ordering stops, each product variation's confirmed vials are packed into kits in the exact sequence the orders were placed; whole kits ship, and the customers holding the leftover vials are owed their money back.

## Plan Decisions Confirmed Before Implementation
Three points in the brief needed a decision; all three were raised in the plan and confirmed by the user.

| # | Decision | Outcome |
|---|---|---|
| A | The brief said COD orders should be "No Refund Required". **This branch changed COD to cover the shipping fee only** (`payment.ts:codAmountDue`, `20260824000500`), so COD customers have already paid for their vials online. | Refund status is driven by **what was actually paid**, never by payment type. `no_refund_required` fires only when the arithmetic says nothing is owed. Marking COD ligwak customers "No Refund Required" would have kept money they had paid. |
| B | Kit scope: per product, or per variation? | **Per (product, variation).** A 5mg vial cannot fill a 10mg kit, caps are already variation-aware, and the dashboard spec asks for the exact mg. |
| C | "After the Group Buy closes" vs. this codebase's `open → finalizing → finalized → closed`. | Preview runs throughout `finalizing`; **locking the allocation is a precondition of `finalize_group_buy_batch`**, where totals already lock. |

Three lines of the brief arrived truncated. Interpretations recorded rather than silently widened: *"Ex**clude un**paid Pay Now orders"*, *"Admin must preview the allo**cation** before finalizing"*, *"Enter the refunde**d amount**"*.

## User Journeys
1. As an admin, I want to set the required vials per complete kit on each product and variation, so kit maths reflects what the supplier actually ships instead of a hard-coded 10.
2. As an admin, when the buy closes I want vials allocated into kits strictly oldest-order-first, so the customers who ordered last — and only they — carry the incomplete kit.
3. As an admin, I want an order that straddles the last complete kit split per vial, so a customer whose vials did fill a kit is not cancelled wholesale.
4. As an admin, I want to preview the allocation and see which customers and quantities completed each kit before committing anything.
5. As an admin, I want the approved allocation locked, so later changes cannot silently rearrange who is ligwak after refunds have started.
6. As an admin, I want a Ligwak Management page with refund statuses, references, proof, notes, notification and export.
7. As a customer, I want my own order history to tell me what was affected, what still ships, what is coming back and where that refund stands.

## Task Report
| Task | Summary | Validation | RED → GREEN | Guarantee |
|---|---|---|---|---|
| Kit size | `resolveKitSize` resolves variation → product → `DEFAULT_VIALS_PER_KIT`; nullable columns | `npx vitest run src/constants/kit.test.ts src/utils/kitSizeMigration.test.ts` | 2 failed suites (`./kit` unresolved, migration ENOENT) → **11 passed** | Kit size is per product/variation; a non-positive or fractional value can never reach the divide |
| Mirror fix | `countsAsConfirmedOrder` was missing the SQL's `submitted` + `paid_total` branch | `npx vitest run src/constants/confirmedOrder.test.ts src/constants/payment.test.ts` | 1 failed (`expected false to be true`) → **76 passed** | Preview and lock agree on eligibility; a paid order under receipt review is not dropped |
| Allocation engine | `allocateKits` packs oldest-first, splits per vial, total ordering | `npx vitest run src/utils/ligwak.test.ts` | 1 failed suite (`./ligwak` unresolved) → **19 passed** | Both worked examples from the brief; ties broken deterministically |
| Refund maths | `computeLigwakRefund` prorates the discount, caps at `paid_total − refunded_total` | `npx vitest run src/constants/ligwak.test.ts src/utils/ligwakRefund.test.ts` | 2 failed suites → **21 passed** | Refund equals actual payment; COD vials refunded, uncollected COD shipping fee not |
| Batch assembly | `buildBatchLigwak` discovers streams, decides whole-order-ligwak across lines | `npx vitest run src/utils/ligwakBatch.test.ts` | 1 failed suite → 11 passed, **1 real defect caught**, → **12 passed** | Shipping fee refunded once per order, not once per line |
| Schema + RPCs | 4 tables, freeze trigger, 7 RPCs, finalize guard | `npx vitest run src/utils/ligwakMigrations.test.ts` | 1 failed suite (ENOENT) → **26 passed** | anon has no grant; locking is one-way; every consequential action audited |
| Export + history | `buildLigwakCsv`; `ligwak` column on all three history functions | `npx vitest run src/utils/ligwakExport.test.ts src/utils/ligwakHistoryMigration.test.ts` | 2 failed suites → **14 passed** | Customer sees status/amount/reference and never admin notes |
| Customer notice | `LigwakNotice` | `npx vitest run src/components/orderhistory/LigwakNotice.test.tsx` | 1 failed suite → **10 passed** | Partial fulfilment does not read as a cancellation; no reference promised before one exists |
| Admin table | `LigwakTable` | `npx vitest run src/components/ligwak/LigwakTable.test.tsx` | 1 failed suite → **7 passed** | Quantities kept distinct; a COD record shows a real refund owed |
| Preview panel | `KitAllocationPanel` | `npx vitest run src/components/groupbuy/KitAllocationPanel.test.tsx` | 1 failed suite → **11 passed** | Kit-by-kit ledger; locking is confirmation-gated |
| Refund modal | `LigwakRefundModal` | `npx vitest run src/components/ligwak/LigwakRefundModal.test.tsx` | 1 failed suite → **8 passed** | Refund cannot be zero or exceed the calculated amount |
| Management page | `LigwakManager` + `useLigwak` | `npx vitest run src/components/ligwak/LigwakManager.test.tsx` | 1 failed suite → **9 passed** | Export writes the filtered on-screen list, not the whole batch |
| Wiring | Dashboard tile + route, Group Buy `ligwak` tab, history detail, `useKitAllocation` | `npx tsc --noEmit`, `npm run build` | n/a | 0 type errors; build clean |

## Test Specification
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | 15 vials at kit size 10 → 1 complete kit, 5 ligwak | `ligwak.test.ts:splits 15 vials into one complete kit and 5 ligwak vials` | unit | PASS |
| 2 | A=8 + B=5 splits B into 2 confirmed + 3 ligwak, not a cancelled order | `ligwak.test.ts:splits ONE order per vial rather than cancelling all of it` | unit | PASS |
| 3 | An exact multiple leaves nothing ligwak | `ligwak.test.ts:leaves nothing ligwak when the total is an exact multiple` | unit | PASS |
| 4 | A total below one kit makes every vial ligwak | `ligwak.test.ts:marks every vial ligwak when the total never reaches a single kit` | unit | PASS |
| 5 | Kits fill oldest-first regardless of input order; the latest order carries the incomplete kit | `ligwak.test.ts:fills kits oldest first regardless of the order the input arrives in` | unit | PASS |
| 6 | Identical timestamps resolve identically in both directions | `ligwak.test.ts:breaks an identical timestamp deterministically` | unit | PASS |
| 7 | Cancelled, unconfirmed, unpaid Pay Now, failed and refunded orders do not fill a kit | `ligwak.test.ts:only eligible confirmed orders fill a kit` (5 cases) | unit | PASS |
| 8 | Unpaid COD and admin-vouched orders DO fill a kit | `ligwak.test.ts:counts an unpaid COD order`, `:counts an unpaid Pay Now order an admin took responsibility for` | unit | PASS |
| 9 | A 5mg vial cannot fill a 10mg kit | `ligwak.test.ts:ignores a different variation of the same product` | unit | PASS |
| 10 | The allocator never mutates its input | `ligwak.test.ts:does not mutate the orders it was given` | unit | PASS |
| 11 | A promo discount is prorated onto the refunded vials | `ligwakRefund.test.ts:prorates an order-level discount across the refunded vials` | unit | PASS |
| 12 | A refund never exceeds what was received, less what was already refunded | `ligwakRefund.test.ts:never refunds more than was actually received`, `:subtracts what has already been handed back` | unit | PASS |
| 13 | **A COD customer is refunded for their ligwak vials** | `ligwakRefund.test.ts:refunds a COD customer for their ligwak vials` | unit | PASS |
| 14 | An uncollected COD shipping fee is not "refunded" | `ligwakRefund.test.ts:does not refund a COD shipping fee that was never collected` | unit | PASS |
| 15 | A prepaid shipping fee returns only when the entire order is ligwak | `ligwakRefund.test.ts:returns the prepaid shipping fee when the whole order is ligwak`, `:keeps the shipping fee when the order is only partly ligwak` | unit | PASS |
| 16 | An order entirely ligwak across two lines refunds its shipping fee ONCE | `ligwakBatch.test.ts:treats an order as entirely ligwak only when every one of its lines is` | unit | PASS |
| 17 | An order still shipping another line keeps its shipping fee | `ligwakBatch.test.ts:keeps the shipping fee when another line on the same order still ships` | unit | PASS |
| 18 | `kit_size` is snapshotted onto the allocation | `ligwakMigrations.test.ts:snapshots the kit size onto the allocation` | unit (SQL) | PASS |
| 19 | Ledger rows always satisfy `quantity = confirmed + ligwak` | `ligwakMigrations.test.ts:keeps every ledger entry internally consistent` | unit (SQL) | PASS |
| 20 | anon holds no grant on any of the four ligwak tables | `ligwakMigrations.test.ts:gives anon no grant on any ligwak table` | unit (SQL) | PASS |
| 21 | Preview reads without writing | `ligwakMigrations.test.ts:reads without writing, so a preview can never change the data` | unit (SQL) | PASS |
| 22 | The SQL allocator orders by `created_at, order_number, id` | `ligwakMigrations.test.ts:allocates strictly by placement time with a deterministic tie-break` | unit (SQL) | PASS |
| 23 | The SQL eligibility predicate matches the caps', including the `submitted` branch | `ligwakMigrations.test.ts:mirrors the confirmed-order predicate the caps already use` | unit (SQL) | PASS |
| 24 | Recalculation requires explicit confirmation | `ligwakMigrations.test.ts:requires explicit confirmation before rearranging a locked allocation` | unit (SQL) | PASS |
| 25 | Every consequential action writes an audit row | `ligwakMigrations.test.ts:writes an audit row for every consequential action` | unit (SQL) | PASS |
| 26 | A batch cannot be finalized while its allocation is unlocked | `ligwakMigrations.test.ts:blocks finalizing a batch whose kit allocation was never locked` | unit (SQL) | PASS |
| 27 | The customer history never sends admin notes or contact details | `ligwakHistoryMigration.test.ts:never sends admin-only fields to the customer` | unit (SQL) | PASS |
| 28 | The customer notice distinguishes the part that still ships | `LigwakNotice.test.tsx:reassures the customer about the part that still ships` | unit | PASS |
| 29 | No refund reference is shown before one exists | `LigwakNotice.test.tsx:hides the reference row while there is no reference yet` | unit | PASS |
| 30 | Locking is confirmation-gated and abortable | `KitAllocationPanel.test.tsx:confirms before locking`, `:does not lock when the admin backs out` | unit | PASS |
| 31 | A refund cannot be zero or exceed the calculated amount | `LigwakRefundModal.test.tsx:refuses to record a refund of zero`, `:refuses to refund more than the calculated amount` | unit | PASS |
| 32 | Export writes the filtered on-screen list, not the unfiltered set | `LigwakManager.test.tsx:exports the list that is currently on screen` | unit | PASS |

## Defect Found by the Tests
**Shipping fee refunded once per line instead of once per order.** An order entirely ligwak across two lines had its ₱500 fee added to *each* record — ₱8,000 refunded where ₱7,500 was owed. Caught by guarantee #16 during Phase 2c, before the code ever ran. Fixed with a per-order `shippingClaimed` set in `ligwakBatch.ts`; only the first record of an order may claim the fee.

## Pre-existing Bug Fixed (required for this feature)
`countsAsConfirmedOrder` declares itself a mirror of the `confirmed_quantity` FILTER in `get_group_buy_progress`, "database authoritative … keep the two in step". It was missing the SQL's `payment_status = 'submitted' AND paid_total IS NOT NULL` branch — an order that was paid and then moved to `submitted` by `submit_additional_payment` when a balance receipt was uploaded.

Impact beyond Ligwak: the client understated confirmed units in admin KPIs and the group-buy board, and freed a cap slot the customer had paid for. Ligwak made it consequential rather than cosmetic — the admin previews with the TS predicate and the database locks with the SQL one, so an affected order would move in or out of the incomplete kit between preview and lock.

Fixed in `86ca045`. Only the 8-line fix was staged; the unrelated uncommitted COD work in `payment.ts` was deliberately left in the working tree.

## Coverage & Known Gaps
- **Ligwak suites: 156 passed / 15 files** (`npx vitest run` over the 15 ligwak test files).
- **Full suite: 1427 passed / 112 files.** Two suites fail: `useReturningCustomer.test.ts` and `checkoutPrefill.test.ts`. Both are **pre-existing orphaned tests** committed at `bbb47eb` whose implementations were never committed; they fail with `Failed to resolve import`, are unrelated to Ligwak, and were failing before this work began.
- **`npx tsc --noEmit` — 0 errors** project-wide. **`npm run build`** — built in 3.52s.
- **Coverage percentage NOT measured.** `@vitest/coverage-v8` is not installed and there is no `test:coverage` script; installing a dependency was out of scope for this change. The 80% target is therefore **unverified by tooling** — test counts above are the substitute evidence. To measure: `npm i -D @vitest/coverage-v8` then `npx vitest run --coverage`.
- **`npm run lint` cannot run.** ESLint 9.36 crashes on *every* file, including untouched ones (`TypeError: … reading 'allowShortCircuit'` — an eslint/@typescript-eslint version mismatch in `node_modules`). Pre-existing and unrelated.
- Not covered by automated tests, consistent with repo convention:
  - SQL executed against a live database (no DB test harness in the repo). The migrations are asserted as text only — the allocation SQL, the freeze trigger and the RLS policies have **never been run**.
  - `useLigwak` / `useKitAllocation` Supabase plumbing (covered indirectly via mocked hooks in the component tests).
  - `AdminDashboard` / `GroupBuyManager` prop-threading (integration-level; covered by typecheck + build).

## Merge / RED–GREEN Summary
| Commit | Stage |
|---|---|
| `4c8ff16` | RED — per-product kit size |
| `ff5e190` | GREEN — `resolveKitSize` + migration |
| `810989c` | RED — allocation engine (21 cases) |
| `1e138ec` | GREEN — `allocateKits`, 19 passed |
| `ed5752c` | RED — refund calculation |
| `5bb6921` | GREEN — `computeLigwakRefund` + status vocabulary, 21 passed |
| *(RED)* | batch assembly reproducer |
| `94d64cb` | GREEN — `buildBatchLigwak`, 12 passed, per-line shipping defect fixed |
| *(RED)* | `countsAsConfirmedOrder` mirror drift |
| `86ca045` | GREEN — mirror fix, 76 passed |
| *(RED)* | schema + RPC reproducer |
| `f6f2751` | GREEN — 4 tables, 7 RPCs, 26 passed |
| *(RED)* | export + customer history |
| `36fb2cc` | GREEN — CSV + history migration, 14 passed |
| `144ce1e` | RED — customer notice + admin table |
| `d780c56` | GREEN — both components, 17 passed |
| `4ea9059` | RED — preview panel + refund modal |
| `1f2d87f` | GREEN — both, 19 passed |
| *(RED)* | management page |
| `bce5d31` | GREEN — wiring, 1427 passed, tsc + build clean |

## Follow-up — REQUIRED BEFORE RELEASE
1. **Four migrations are not applied to the remote Supabase project.** The feature is inert until they run, in order:
   `20260827000000_product_kit_size.sql` → `20260827000100_ligwak_allocation.sql` → `20260827000200_ligwak_rpcs.sql` → `20260827000300_order_history_ligwak.sql`.
   Apply via `supabase db push` / MCP `apply_migration`.
2. **`20260827000200` changes `finalize_group_buy_batch`.** After it is applied, no batch can be finalized until its kit allocation is locked. Any batch mid-`finalizing` at deploy time needs its allocation locked first.
3. **Set `vials_per_kit` on real products.** Every product falls back to 10 until an admin enters the true kit size — correct for existing behaviour, but wrong for any product the supplier packs differently.
4. **Verify the allocation SQL against real batch data before locking anything.** The PL/pgSQL window-function allocator agrees with the TS engine by inspection and by construction (`lock` persists `preview`'s output), but the two have never been run against the same live dataset. Preview a closed historical batch and compare against `buildBatchLigwak` before trusting a lock.
5. `get_group_buy_progress` still inlines the confirmed-order predicate that now also lives in `preview_kit_allocation`. Consider extracting a shared SQL helper next time either is touched, so the third copy cannot drift the way the TS mirror did.
