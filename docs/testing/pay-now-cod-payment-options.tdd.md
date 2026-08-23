# TDD Evidence — Pay Now / Cash on Delivery payment options

**Source plan**: inline plan produced by `/ecc:plan` in this session (not written to a `.plan.md`).
**Branch**: `feat/pay-now-cod-payment-options`
**Date**: 2026-08-24

## User journeys

1. As a shopper, I want to choose between paying online now and paying the courier cash, so I can order without an e-wallet.
2. As a COD shopper, I want to know exactly how much cash to have ready, so the courier is not turned away.
3. As a customer, I want my payment option and its status visible in order confirmation and order history, so I know what I owe and when.
4. As an admin, I want the real payment status on every order, so I can tell paid from failed from refunded.
5. As an admin, I want a failed or unpaid Pay Now order NOT counted as a confirmed order unless I deliberately confirm it, so batch demand and cap maths are not inflated by money that never arrived.
6. As a courier, I want the waybill to state the cash to collect, so COD money is actually collected.

## Baseline

Recorded before any change, so my RED signals were distinguishable from existing breakage:

```
npm test  =>  Test Files 9 failed | 78 passed (87)
              Tests     21 failed | 908 passed (929)
```

All 9 pre-existing failures were in unrelated in-progress work (feature flags, header nav) plus two orphaned test files whose modules do not exist (`useReturningCustomer.test.ts`, `checkoutPrefill.test.ts`).

## Task report

| # | Task | Validation run | RED evidence | GREEN evidence |
|---|---|---|---|---|
| 1 | Shared payment vocabulary | `npx vitest run src/constants/payment.test.ts` | `Failed to resolve import "./payment"` | `33 passed (33)` |
| 2 | DB schema, enforcement, confirmed-order rule, RPC passthrough | — | — | **NOT EXECUTED — see Gaps** |
| 3 | Checkout Pay Now / COD | `npx vitest run src/components/Checkout.test.tsx` | 10 failed — `Unable to find role="radio" name /Cash on Delivery/i` | `32 passed (32)` |
| 4 | Payment-aware admin confirmation | `npx vitest run src/utils/orderConfirmation.test.ts` | `Failed to resolve import "./orderConfirmation"` | `14 passed (14)` |
| 5 | Waybill COD collection | `npx vitest run src/utils/waybill.test.ts` | 8 failed (22 pre-existing still green) | `30 passed (30)` |
| 6 | Confirmed-order drift in admin closeout | `npx vitest run src/utils/groupBuyOverview.test.ts` | 2 failed — `expected 2 to be +0` on failed/unpaid Pay Now | `58 passed (58)` |
| 7 | COD kill-switch parsing | `npx vitest run src/hooks/useCodAvailability.test.ts` | (added with impl; parsing extracted from working code) | `5 passed (5)` |
| 8 | Members CSV payment columns | `npx vitest run src/utils/batchExports.test.ts` | 1 failed — header shape changed deliberately | `11 passed (11)` |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A pending COD order reads "Collect on Delivery", never "Pending Payment" | `src/constants/payment.test.ts` | unit | PASS |
| 2 | A failed Pay Now order does NOT count as confirmed | `payment.test.ts:countsAsConfirmedOrder` | unit | PASS |
| 3 | A manually confirmed failed order DOES count | `payment.test.ts:countsAsConfirmedOrder` | unit | PASS |
| 4 | A cancelled order never counts, even manually confirmed | `payment.test.ts:countsAsConfirmedOrder` | unit | PASS |
| 5 | COD amount = total + shipping, no surcharge | `payment.test.ts:codAmountDue` | unit | PASS |
| 6 | A COD order places with no method and no receipt | `Checkout.test.tsx:payment options` | component | PASS |
| 7 | Pay Now still blocks until a receipt is attached | `Checkout.test.tsx:payment options` | component | PASS |
| 8 | Pay Now with no method fails BEFORE uploading (no orphaned file) | `Checkout.test.tsx:payment options` | component | PASS |
| 9 | The COD insert carries `payment_type:'cod'` and null method/proof | `Checkout.test.tsx:payment options` | component | PASS |
| 10 | Confirming a COD order does NOT mark it paid | `orderConfirmation.test.ts` | unit | PASS |
| 11 | Confirming a failed payment needs an override and stamps who did it | `orderConfirmation.test.ts` | unit | PASS |
| 12 | Confirming never relabels a failed payment as paid | `orderConfirmation.test.ts` | unit | PASS |
| 13 | A COD waybill states the exact cash to collect | `waybill.test.ts` | unit | PASS |
| 14 | Cash to collect is summed across a consolidated waybill | `waybill.test.ts` | unit | PASS |
| 15 | Admin closeout "confirmed" matches the DB predicate | `groupBuyOverview.test.ts` | unit | PASS |
| 16 | Client COD switch agrees with the SQL trigger's accepted values | `useCodAvailability.test.ts` | unit | PASS |

## Final validation

```
npm test               =>  Tests 1078 passed (1078), 0 failed
                           Test Files 2 failed | 89 passed (91)
                           — both are the pre-existing orphans (missing modules)
npm run build          =>  built in 28.18s, ok
npx tsc --noEmit       =>  no new errors (see Gaps for pre-existing)
```

The 2 failing test FILES are the pre-existing orphans carried from the baseline; they are collection errors (missing modules), not failing assertions, and are unrelated to this work.

## Coverage and known gaps

**Not verified — SQL migrations.** `psql`, Docker and the `supabase` CLI are all absent from this environment, so the four migrations were reviewed by hand and **never executed or even syntax-checked**. They must be applied to a Supabase branch and smoke-tested before production. Specifically worth testing there:
- an anon COD insert while `cod_enabled='false'` is rejected;
- an anon insert with `is_claim=true` is still rejected (the CRITICAL regression below);
- `get_group_buy_progress` confirmed counts before/after;
- the staleness guard fires if an older migration is re-applied.

**Deliberately not done:**
- `get_order_details` left payment-blind — no client code calls it (only `get_order_bundle` / `get_orders_by_email` are used).
- Email templates (`emails/tbs_order_*.html`) not updated. They are PostHog-side; `payment_type` is now sent on `tbs_order_placed`, so the data is available when someone edits them.
- `useOrderHistory.SavedOrder` not extended — it is a localStorage convenience and the tracking page reads authoritative data from the server.
- `paid_total` is still not set when an admin confirms an order. This is pre-existing (it predates this work) and means `balance_due` stays 0 for newly confirmed orders, so the "additional payment" flow never triggers for them. Left alone as out of scope, but it looks like a real bug worth a follow-up.

**Fixed after peer code review** (a second session ran `/code-review` over the branch; both findings independently verified here before acting):
- **CRITICAL**: `20260824000100` recreated the `orders_public_insert` RLS policy from the `20260621000000` text and dropped `AND is_claim = false`, which `20260624000300` had added to stop anon forging a leftover claim against any order. Restored. Root cause: I checked for the newest definition of `get_group_buy_progress` but not of the RLS policy.
- Duplicate migration prefix `20260824000200` — mine renumbered to `000150`.
- Seven further findings (orphaned upload, kill switch with no client half, uncleared `refunded_total`, COD blocked on leftover claims, shared VALIDATE handler, list numbering, and the `groupBuyOverview` confirmed-order drift) are all fixed and covered by tests above.

**Fixed after a second peer code review** (6 findings in these files, each verified here first):
- Waybill printed two conflicting figures — `grandTotal` (from undiscounted `order_items`) vs the COD line (from discounted `total_price`). The discount is now recovered and shown, both figures share components, and a fully-COD sheet collects exactly the printed total.
- `countsAsConfirmedOrder` short-circuited on `payment_type === 'cod'` before checking `payment_status`, so a refused COD delivery marked Failed kept its cap slot — the same bug class the migration closed for Pay Now. Fixed client-side and in the SQL; marker bumped to `payment-aware-v2`.
- The COD kill switch's two halves disagreed on a missing settings row (client ON, server reject). Client now matches on the absent row; a failed read defers to the server.
- `.wb-cod` had no CSS rule at all. Now styled and print-colour-forced.
- Selecting COD before availability resolved left a disabled card selected with a live submit button.
- Stale `20260824000200` cross-reference after the rename.

**Fixed after a third review** (my own `/code-review`; 10 findings in these files):
- **CRITICAL** — `useBatchOrders.confirmOrder` is a second confirm path beside `OrdersManager` and was never migrated. It forged `payment_status:'paid'`, so a COD order confirmed from the Group Buy panel was dropped from `codOrders` and its COLLECT ON DELIVERY banner never printed. `bulkUpdateStatus` had the same bug.
- **HIGH** — `addLinkedOrder` sent no `payment_method_id`/`payment_type`, so my own trigger rejected it; adding a linked order to any group-buy parent was broken. Fixed on both sides.
- **HIGH** — no in-flight guard: a COD double-tap placed two orders.
- `submit_additional_payment` (paid → submitted) silently dropped a paid order out of confirmed demand; marker now `payment-aware-v3`.
- New backfill migration `20260824000400` preserves confirmed counts for orders advanced under the old rule, rather than silently lowering cap demand on live batches.
- Status dropdown `new → Packing` bypassed the payment decision entirely.
- A manual confirmation outlived the payment it overrode, permanently burning a cap slot.
- `isCodCollectible` now gates the COLLECT banner and CSV column, so cancelled/refunded COD orders no longer print an amount.
- `REVOKE` on the trigger function; COD confirmation notification carries the cash due.

**Review rounds and what they say about the first pass.** Three review rounds found 27 issues in this work, including two that would have lost real money (a courier collecting nothing on a confirmed COD order, twice over) and one security regression that reverted an existing CRITICAL fix. The recurring cause was assuming a single code path where the codebase had two: one RLS policy definition superseded by a newer one, one confirm handler when `useBatchOrders` held a second, one `confirmed` predicate when `groupBuyOverview` held a duplicate. Grepping for *all* writers of a column before changing its meaning would have caught most of them.

**Suite flakiness under load.** Full-suite runs intermittently fail 1–3 different tests each time (`Cart`, `MenuItemCard`, `useCart.server`, `BatchCloseoutPanel`, `App`, and occasionally a Checkout COD test). Every one passes in isolation; `Checkout.test.tsx` was run twice consecutively at 32/32. These are timing-sensitive component tests under parallel load, made worse by a second session writing to the same working tree during runs. Not stable regressions, but the suite is not reliably green in a single pass.

**Two pre-existing fixtures changed, not the code.** `groupBuyOverview.test.ts` asserted that a *delivered but never-paid* order counts as confirmed — the payment-blind rule this work replaces, in a state the app cannot produce (confirming marks an order paid). The fixtures were made realistic rather than the predicate weakened.
