# TDD evidence — "Group buy limit reached (cap 20, already reserved 27)" on a variation that still had room

**Source plan:** none — journeys derived during this TDD run from the reported production error.

## The report

Checkout returned HTTP 400 with Postgres error `23514`:

```
Group buy limit reached for one of the items in your order
(cap 20, already reserved 27, you requested 1).
```

…while the storefront showed the item as still available.

## Diagnosis (live data, read-only)

Called the anon-granted RPC `get_group_buy_progress` against the production project.
Open batch: **Gb 5** (`95f61962-…`). The one product matching `cap 20 / reserved 27`:

```json
{
  "product_name": "AICAR",
  "cap_quantity": 40,            // product-level cap
  "total_quantity": 27,          // 15 + 12 across variations
  "variations": [
    { "variation_name": "100mg", "cap_quantity": 20, "total_quantity": 15 },
    { "variation_name": "50mg",  "cap_quantity": 20, "total_quantity": 12 }
  ]
}
```

Both variations had headroom (5 and 8), and the product pool was 27/40. The number
27 is the **product** total; 20 is a **variation** cap. Comparing one against the
other is precisely what the pre-`20260716` definition of
`enforce_group_buy_on_order` does — it loops over every `group_buy_caps` row and
sums *all* of the product's units against it, ignoring `group_buy_caps.variation_id`.

**Root cause:** the deployed function was an older definition than the one shipped
in `20260716000000_group_buy_variation_caps.sql`. Six migration files define the
same function; re-applying any pre-`20260716` file silently reverts cap enforcement
to product-level. Storefront math (`src/utils/groupBuy.ts:remainingForVariation`)
stayed variation-aware, hence UI-says-available / DB-says-full.

The repo source was correct; the defect was deployment drift plus the absence of
any guard that makes such drift detectable.

## User journeys

1. As a shopper, I want to order a variation that still has slots, so that a
   sibling variation filling up does not block me.
2. As an operator, I want to verify which cap-enforcement version is live, so that
   a re-applied old migration is caught immediately instead of at checkout.

## Task report

| Task | Summary |
|---|---|
| Reproduce & locate | Matched the error numbers to live batch data via `get_group_buy_progress` (AICAR, above). No writes performed. |
| RED | Added `src/utils/capEnforcementMigrations.test.ts` encoding the drift invariants; 2 of 4 assertions failed for the intended reason. |
| GREEN | Added `supabase/migrations/20260720000000_repair_variation_aware_cap_enforcement.sql` (idempotent re-install + version marker + self-verify) and `SUPERSEDED — DO NOT RE-APPLY` banners on the four variation-blind definitions. |

### RED

```
$ npx vitest run src/utils/capEnforcementMigrations.test.ts
 FAIL  the newest definition carries a version marker for live fingerprinting
       expected false to be true
 FAIL  every superseded variation-blind definition warns against re-applying it
       expected [ 20260622000000_create_group_buy_batches.sql,
                  20260624000200_group_buy_claims.sql,
                  20260624000300_group_buy_claims_hardening.sql,
                  20260705000000_link_repeat_orders_by_email.sql ] to deeply equal []
 Tests  2 failed | 2 passed (4)
```

### GREEN

```
$ npx vitest run src/utils/capEnforcementMigrations.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)

$ npx vitest run
 Test Files  2 failed | 66 passed (68)
      Tests  797 passed (797)
```

The two failing files are **pre-existing and unrelated**: `src/hooks/useReturningCustomer.test.ts`
and `src/utils/checkoutPrefill.test.ts` are orphan tests whose implementation modules
do not exist in the repo (import resolution error, not an assertion failure). They
fail identically before this change. Every test that executes passes.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The migration set actually contains cap-trigger definitions (guard is not vacuous) | `capEnforcementMigrations.test.ts:finds the migrations that define the cap trigger` | unit | PASS |
| 2 | The newest shipped definition resolves caps per variation, not per product | `capEnforcementMigrations.test.ts:the newest definition enforces caps per variation` | unit | PASS |
| 3 | The newest definition carries `enforcement-version: variation-aware-v2`, so the deployed body can be fingerprinted with `pg_get_functiondef` | `capEnforcementMigrations.test.ts:carries a version marker for live fingerprinting` | unit | PASS |
| 4 | Every superseded variation-blind definition warns against re-applying it | `capEnforcementMigrations.test.ts:every superseded variation-blind definition warns` | unit | PASS |

## Known gaps

- **The production database is not yet fixed by this commit.** The repair migration
  must be applied (paste `20260720000000_repair_variation_aware_cap_enforcement.sql`
  into the Supabase SQL editor and run it whole). It ends with a `DO` block that
  raises if the installed body is still stale, so a successful run *is* the GREEN
  proof server-side.
- Live check, any time:
  ```sql
  SELECT pg_get_functiondef('public.enforce_group_buy_on_order()'::regprocedure)
         LIKE '%enforcement-version: variation-aware-v2%' AS is_variation_aware;
  ```
  `false` ⇒ an older migration file was re-applied over the repair.
- No pgTAP/embedded-Postgres harness exists in this repo, so trigger behaviour
  itself is not covered by an automated test; the guard covers the drift class that
  caused this incident. Adding a Postgres-backed test harness remains open follow-up.
