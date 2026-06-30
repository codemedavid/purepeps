# TDD Evidence — Edit Order Balance Payment (Group Buy)

**Feature:** When an admin adds items to an already-paid group-buy order, the order grows a **balance** (new total − amount paid). The customer (self-serve on `/track-order`) **or** the admin (on the customer's behalf) uploads a new receipt for the difference, and the admin **re-verifies** the order as fully paid. A **soft gate** warns — but does not block — confirming while a balance is outstanding.

**Source plan:** No `*.plan.md`; journeys derived from the user request during the `/ecc:plan` run.

## User journeys

1. As an admin, when I add items to a paid order, I want it to show a **balance due** so I don't ship under-paid orders.
2. As a customer, when items were added after I paid, I want to see how much more I owe and **upload a new receipt** on the tracking page.
3. As an admin, I want to **upload the balance receipt for the customer** when they send it over FB/WhatsApp.
4. As an admin, I want to **mark the balance paid** once I've verified the new receipt.
5. As an admin, I want a **warning (not a hard block)** if I confirm an order that still owes a balance.

## Scope decisions (confirmed with user)

- **Balance difference only** — customers pay/prove the added amount, not the whole order again. Tracked via `orders.paid_total`; `balance_due = max(0, total_price − paid_total)` (derived, never stored).
- **Notify via tracking page + manual ping** — the `/track-order` banner surfaces the balance; the admin messages the customer through the FB/WhatsApp contact already on file. No email infra added.
- **Soft gate** — confirming an order with a balance routes through the confirm dialog ("Confirm as paid?") and proceeds on override.
- Customer write path is the `submit_additional_payment` RPC (SECURITY DEFINER, anon, order-number = auth token); it only accepts a receipt when a balance is owed and can only set `payment_status = 'submitted'` (under review) — never `'paid'`.
- **Two new migrations:** `20260707000000_order_balance_fields.sql` (columns + backfill of `paid_total` for existing paid orders) and `20260708000000_order_balance_rpcs.sql` (`get_order_bundle` returns `paid_total`/`balance_due`; adds `submit_additional_payment`).

## Task report

| Behavior | Validation command | RED → GREEN |
|---|---|---|
| `useBatchOrders` balance detection, `verifyAdditionalPayment`, `attachAdminPaymentProof`, `confirmOrder` records `paid_total` | `npx vitest run src/hooks/useBatchOrders.test.ts` | RED: `verifyAdditionalPayment is not a function` → GREEN: 6/6 pass |
| `BatchOrderDetail` balance banner, mark-paid, soft-gate confirm | `npx vitest run src/components/groupbuy/BatchOrderDetail.test.tsx` | RED: balance banner not found → GREEN: 6/6 pass |
| `OrderTracking` balance banner + receipt re-upload via `submit_additional_payment` | `npx vitest run src/components/OrderTracking.test.tsx` | RED: banner not found → GREEN: 3 new + existing pass |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Editing a paid order's items higher flips it to balance-due (`payment_status='pending'`, stale receipt cleared, baseline pinned, audit note) | `useBatchOrders.test.ts` | unit (hook) | PASS |
| 2 | Self-heals `paid_total` for an order paid before the field existed | `useBatchOrders.test.ts` | unit | PASS |
| 3 | Editing an unpaid order never touches payment fields | `useBatchOrders.test.ts` | unit | PASS |
| 4 | `confirmOrder` records `paid_total` = current total | `useBatchOrders.test.ts` | unit | PASS |
| 5 | `verifyAdditionalPayment` marks paid + advances `paid_total` to the new total | `useBatchOrders.test.ts` | unit | PASS |
| 6 | `attachAdminPaymentProof` stores the proof and marks it under review | `useBatchOrders.test.ts` | unit | PASS |
| 7 | Admin balance banner shows; "Mark balance paid" calls `onVerifyBalance` | `BatchOrderDetail.test.tsx` | unit (RTL) | PASS |
| 8 | Confirming a balance-owing order soft-gates through the confirm dialog | `BatchOrderDetail.test.tsx` | unit | PASS |
| 9 | No balance banner when nothing is owed | `BatchOrderDetail.test.tsx` | unit | PASS |
| 10 | Customer banner prompts for the balance and submits via `submit_additional_payment` | `OrderTracking.test.tsx` | unit | PASS |
| 11 | "Under review" message once a balance receipt is submitted | `OrderTracking.test.tsx` | unit | PASS |
| 12 | No customer banner when `balance_due` is 0 | `OrderTracking.test.tsx` | unit | PASS |

## Full-suite validation

- `npx vitest run` → **462 passed (42 files)**
- `npx tsc --noEmit` → clean
- `npm run build` → succeeds

## Known limitations / follow-ups

- The customer re-upload banner targets the **root order**. If a *linked repeat order* (Order 2) accrues a balance, it shows in the admin detail but not as a self-serve banner — the customer is pinged manually. Acceptable per the agreed scope.
- Lowering an order's total below `paid_total` is treated as no balance; any **overpayment refund is handled manually** (an audit line is appended).
- `npm run lint` currently crashes globally on `api/keepalive.ts` due to an `@typescript-eslint/no-unused-expressions` plugin/version mismatch (`allowShortCircuit` undefined) — pre-existing, unrelated to this feature.
