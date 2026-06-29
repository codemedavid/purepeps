# TDD Evidence — Link repeat orders from the same email under one tracking

## Source plan
No `*.plan.md`. Journeys derived during this TDD run from the request: *"if a
customer from the same email orders again, put the order under the same tracking
but a different order sequence (Order 1, Order 2) with its own payment method."*

Scope confirmed with the user:
- **Link scope:** same open batch only.
- **Trigger & label:** auto-link by email, label Order 1 / Order 2 / …
- **Payment model:** each linked order keeps its own payment method, proof, status.

## User journeys
1. As a returning customer, when I check out again with the same email during the
   same open group buy, my new order is attached to my first order so I can track
   them together under one order number.
2. As that customer, when I track my order I see each of my orders numbered
   (Order 1, Order 2, …) with its own payment method, status, items, and total.
3. As a first-time customer (or a customer in a different batch), my order stays
   independent — the tracking page looks exactly as before (no extra section).

## Design summary
The storefront runs as the anon role, which cannot read `orders` back (PII
lockdown), so it cannot discover a prior order id to link to. Linking is therefore
**server-side** in the existing `enforce_group_buy_on_order` BEFORE-INSERT trigger,
which already resolves the open batch authoritatively. A repeat order is a normal
order (`is_claim = false`) with `parent_order_id` set to the customer's first order
in that batch. The existing `get_order_bundle` RPC already returns root + linked
rows; it was extended to also return `payment_method_name`. The Checkout component
needs **no change** — linking is fully server-driven.

This is distinct from leftover **claims** (`is_claim = true`), which only exist while
a batch is *finalizing*; repeat orders happen while the batch is *open* and render in
their own numbered section, not the "Add-ons" section.

## Task report

### Task 1 — Pure sequencing helper `sequenceBundleOrders`
- Filters out claim rows, sorts root-first then by `created_at`, labels "Order N".
- RED: `npx vitest run src/utils/orderTracking.test.ts` → `TypeError: sequenceBundleOrders is not a function`.
- GREEN: implemented in `src/utils/orderTracking.ts`; same command passes.
- Guarantees: correct ordering/numbering independent of DB row order; claims excluded.

### Task 2 — Tracking page numbered-orders section
- `OrderTracking.tsx` renders a "Your orders in this group buy" section (only when
  there is more than one own order), numbering each order with its payment method,
  status, items, and total.
- RED: `OrderTracking.test.tsx` new cases failed (no "Order 1"/"Order 2", no payment names).
- GREEN: section added; cases pass. Single-order tracking is unchanged (no new section).

### Task 3 — DB migration (linking trigger + bundle RPC column)
- `supabase/migrations/20260705000000_link_repeat_orders_by_email.sql`:
  - non-claim branch of `enforce_group_buy_on_order` now sets `parent_order_id` to
    `COALESCE(parent_order_id, id)` of the customer's earliest non-cancelled,
    non-claim order in the same batch (matched on `lower(btrim(email))`).
  - `get_order_bundle` returns `payment_method_name` (exact order-number match only,
    grants unchanged: anon/authenticated).
- Verification: **not run against a live database** in this session (production
  project; not applied via MCP). Reviewed for parity with the prior hardening
  migration. Requires integration verification before/at deploy — see gaps below.

## Test specification

| # | What is guaranteed | Test file or command | Type | Result | Evidence |
|---|--------------------|----------------------|------|--------|----------|
| 1 | Empty bundle → empty sequence | `orderTracking.test.ts:returns an empty list for an empty bundle` | unit | PASS | `vitest run src/utils/orderTracking.test.ts` |
| 2 | Lone root → "Order 1" | `...:labels a lone root order as Order 1` | unit | PASS | same |
| 3 | Repeat from same email → "Order 2", root first regardless of input order | `...:numbers a repeat order from the same email as Order 2, root first` | unit | PASS | same |
| 4 | Multiple repeats ordered by creation time | `...:orders multiple repeats by creation time` | unit | PASS | same |
| 5 | Claim/add-on rows excluded from numbered orders | `...:excludes claim/add-on rows from the numbered orders` | unit | PASS | same |
| 6 | Tracking page numbers linked orders Order 1 / Order 2 | `OrderTracking.test.tsx:numbers each linked order as Order 1 / Order 2` | component | PASS | `vitest run src/components/OrderTracking.test.tsx` |
| 7 | Each order shows its own payment method | `...:shows each order its own payment method` | component | PASS | same |
| 8 | Single order → no numbered-orders section | `...:does not render the numbered-orders section for a single order` | component | PASS | same |

## Coverage and known gaps
- Full suite: `npx vitest run` → **40 files, 435 tests, all passing**.
- Typecheck: `npx tsc --noEmit` → clean.
- ESLint currently crashes on a plugin/version mismatch (`no-unused-expressions`
  rule) repo-wide — pre-existing, unrelated to this change.
- **Gap (integration):** the SQL trigger linking and the new RPC column are not
  covered by an automated DB test in this repo (no pg harness in vitest). Suggested
  manual/integration checks at deploy:
  1. Place order A (email X) in an open batch → A.parent_order_id is NULL.
  2. Place order B (same email X) in the same batch → B.parent_order_id = A.id.
  3. Place order C (different email) → C.parent_order_id is NULL.
  4. Cancel A, place order D (email X) → D becomes its own root (A excluded).
  5. `get_order_bundle('<A.order_number>')` returns A and B with `payment_method_name`.
