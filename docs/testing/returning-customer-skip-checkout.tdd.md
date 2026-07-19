# TDD Evidence — Returning customer skips the checkout form (recognized by email)

**Feature:** When a customer has already ordered from the group buy using the same
email, they no longer re-fill the checkout form. A verified member's prior order
details are fetched from the server and, when complete, the form auto-skips
straight to payment.

**Branch:** `feat/returning-customer-skip-checkout`
**Source plan:** none — journeys derived during this TDD run (invoked via `/ecc:tdd-workflow`).

## User journeys

1. As a returning group-buy member (verified email) on a **new device**, I want my
   saved name/phone/address prefilled so I don't retype everything the localStorage
   prefill can't cover.
2. As a returning member whose saved details are **complete**, I want to jump
   straight to payment ("no form again"), with a way to correct the details if
   they're wrong.
3. As a returning member whose saved details are **incomplete** (e.g. missing
   shipping region), I want the known fields prefilled but to still finish the form.
4. As a **first-time / unverified** shopper, nothing should change — no lookup, no
   skip.
5. As a security-conscious operator, the address lookup must not read the `orders`
   table directly from the anon client, and must only be invoked for the verified
   member's own email.

## What was built

| Layer | File |
|---|---|
| SQL RPC (SECURITY DEFINER) | `supabase/migrations/20260720000000_get_checkout_prefill_by_email.sql` |
| Pure mapper + completeness predicate | `src/utils/checkoutPrefill.ts` |
| Lookup hook | `src/hooks/useReturningCustomer.ts` |
| Checkout wiring (prefill + auto-skip + banner) | `src/components/Checkout.tsx` |

The existing `get_orders_by_email` RPC deliberately returns tracking/totals but
**not** name/phone/address, so a dedicated `get_checkout_prefill_by_email` RPC was
added. It returns the single most-recent non-cancelled root order's contact +
shipping fields, mirrors the enumerable-email tradeoff already accepted for
`get_orders_by_email`, and the client only ever calls it with the verified
(`lockEmail`) member email.

## RED → GREEN

- **RED:** commit `32dd8f2` — added `checkoutPrefill.test.ts`,
  `useReturningCustomer.test.ts`, and the Checkout "returning customer" tests
  before any implementation. Run failed: the two new modules did not exist and
  Checkout had no auto-skip (3 test files failing).
- **GREEN:** commits `6273d7e` + `a12549d`. `a12549d` corrected the Checkout wiring
  (lost from the working tree before the first GREEN commit) and hardened the
  Checkout tests to drive the **real** hook through a mocked `supabase.rpc` rather
  than mocking the hook module, removing a test-file-ordering dependency.

Validation command (final GREEN):

```
$ npx vitest run
 Test Files  67 passed (67)
      Tests  796 passed (796)
```

Focused RED→GREEN command for the feature:

```
$ npx vitest run src/utils/checkoutPrefill.test.ts \
    src/hooks/useReturningCustomer.test.ts src/components/Checkout.test.tsx
      Tests  47 passed (47)
```

`npx tsc --noEmit` — clean (no errors).

## Test specification

| # | What is guaranteed | Test file / name | Type | Result |
|---|--------------------|------------------|------|--------|
| 1 | A null row maps to null; a row maps every field onto SavedCheckoutInfo | `src/utils/checkoutPrefill.test.ts` › mapPrefillRowToCheckoutInfo | unit | PASS |
| 2 | Null server columns coalesce to `''`; empty contactMethod is dropped | `checkoutPrefill.test.ts` › coalesces null server columns | unit | PASS |
| 3 | The mapped email is the caller's verified email, not the row's | `checkoutPrefill.test.ts` › uses the caller-supplied email | unit | PASS |
| 4 | Completeness requires every shipping/contact field; contactMethod optional | `checkoutPrefill.test.ts` › isCheckoutInfoComplete (+ each required field) | unit | PASS |
| 5 | Disabled / empty email → no RPC call | `src/hooks/useReturningCustomer.test.ts` › does not call the RPC | unit (hook) | PASS |
| 6 | Looks up by email and exposes a complete, mapped prefill | `useReturningCustomer.test.ts` › looks up the customer by email | unit (hook) | PASS |
| 7 | No prior order → not found, null prefill | `useReturningCustomer.test.ts` › reports not-found | unit (hook) | PASS |
| 8 | RPC error fails soft (no throw, null prefill) | `useReturningCustomer.test.ts` › fails soft when the RPC errors | unit (hook) | PASS |
| 9 | Verified email triggers the lookup RPC with the right args | `src/components/Checkout.test.tsx` › looks up the prior order with the verified member email | component | PASS |
| 10 | Unverified / unlocked email → no lookup | `Checkout.test.tsx` › does not look up returning details for an unverified email | component | PASS |
| 11 | Complete details auto-skip to payment with a Welcome-back banner | `Checkout.test.tsx` › auto-skips to the payment step | component | PASS |
| 12 | "Not you? Edit details" returns to the prefilled details form | `Checkout.test.tsx` › lets the returning customer go back to edit | component | PASS |
| 13 | Incomplete details prefill but do NOT skip | `Checkout.test.tsx` › prefills but stays on details when incomplete | component | PASS |

## Follow-up: waive shipping on repeat orders in the same batch

**Ask:** "Don't ask for shipping on the 2nd+ order — request one shipping fee once."

A repeat order (the customer's 2nd+ non-cancelled order in the **same open batch**,
matched by email) ships together with their first order, so checkout no longer
asks for a courier/region and charges no second shipping fee.

- **Server (authoritative):** `enforce_group_buy_on_order` already links a repeat
  order to its root via `parent_order_id`; it now also sets `NEW.shipping_fee = 0`
  whenever it makes that link, so the single-fee rule holds regardless of the
  client. `get_checkout_prefill_by_email` additionally returns
  `has_open_batch_order`. Migration:
  `supabase/migrations/20260721000000_waive_shipping_on_repeat_order.sql`.
- **Client:** `useReturningCustomer` exposes `hasOpenBatchOrder`; Checkout derives
  `isRepeatOrder = isBatchOpen && hasOpenBatchOrder` and then hides the
  courier/region selectors, drops them from `isDetailsValid`, forces the displayed
  shipping fee to ₱0, and shows a "Shipping already covered" note.

RED → GREEN commits: `06afac0` (RED) → `e8ed5a6` (GREEN, full suite 808 passed).

Added guarantees:

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 14 | The hook exposes `hasOpenBatchOrder` from the row (defaults false) | `useReturningCustomer.test.ts` › exposes/defaults hasOpenBatchOrder | unit (hook) | PASS |
| 15 | A repeat order hides the courier/region step, shows the waived-shipping note, and can proceed with no courier selected | `Checkout.test.tsx` › hides the courier/region selectors and waives the fee | component | PASS |
| 16 | A returning-but-not-repeat customer still gets the normal shipping step | `Checkout.test.tsx` › still asks for shipping when no order in the open batch | component | PASS |
| 17 | The waiver does not apply when the batch is closed | `Checkout.test.tsx` › does not waive shipping when the batch is closed | component | PASS |

## Coverage and known gaps

- `@vitest/coverage-v8` is not installed in this repo, so a `--coverage` number was
  not produced. Coverage is instead evidenced by the behavior table above: the pure
  util and hook are exercised across happy path, empty/disabled, not-found, and
  error branches; the component covers enabled/disabled, complete/incomplete, and
  the edit-back escape.
- **SQL not unit-tested.** Both migrations (`20260720000000_get_checkout_prefill_by_email.sql`
  and `20260721000000_waive_shipping_on_repeat_order.sql`) need to be applied to
  Supabase (`supabase db push` / MCP `apply_migration`); they were not executed
  against a live DB in this run. Columns are cast to `text` so the `RETURNS TABLE`
  shape is stable regardless of the underlying `courier_id` type. The
  shipping-fee-once rule is enforced in the `enforce_group_buy_on_order` trigger,
  so it holds even for clients that don't render the waiver.
- Ownership is not verified server-side (an email is enumerable); this matches the
  accepted tradeoff already documented for `get_orders_by_email`. A captcha /
  magic-link step is the follow-up if that posture changes.
- Pre-existing note: the repo's `eslint` is broken globally
  (`@typescript-eslint/no-unused-expressions` plugin load error) independent of this
  change; lint could not be run. `tsc --noEmit` passes.
