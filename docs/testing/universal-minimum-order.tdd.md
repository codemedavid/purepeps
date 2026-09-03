# TDD Evidence — Universal Minimum Order per Product

**Source plan**: produced inline via `/ecc:plan` (no `*.plan.md` artifact).
**Branch**: `feat/pay-now-cod-payment-options`
**Status**: complete. All six journeys served — the rule, its storage, the
universal admin control, the per-product fields, the customer-facing notice,
cart enforcement and admin-order validation. Not yet applied to a live
database — see "Known gaps".

| Part | Scope | Checkpoints |
|---|---|---|
| 1 | Resolution rule + cart validation | `aaa9395` RED, `b64de36` GREEN, `2a6c76d` RED, `59c3044` GREEN |
| 2 | Migration | `b64de36` RED, `d7e67aa` GREEN |
| 3 | Settings hook | `e7c1546` RED, `b2107f8` GREEN |
| 4 | Admin panel | `2e8ebb6` RED, `7346601` GREEN |
| 5 | Cart enforcement | `1d47bf5` RED, `9b1c81d` GREEN |
| 6 | Product card + detail notice | `aefdb4a` RED, `2a15f4d` GREEN |
| 7 | Per-product admin fields | `82a430b` RED, `f1d7016` GREEN |
| 8 | useCart product-level floor | `23d3cad` RED, `222d447` GREEN |
| 9 | Admin-order validation | `9196007` RED, `e163b37` GREEN, `bf4788e` GREEN |

## The decision that shapes everything

The client's spec asks for a minimum met by the **combined quantity across a
product's variations**: 4 vials of 10mg + 3 of 20mg + 3 of 30mg satisfies a
minimum of 10.

The code that existed could not express that. `resolveMinOrder()` in
`src/constants/order.ts` answers *"what is the minimum for THIS line"*, letting
a selected variation's own minimum win, and `useCart` clamped each line to it.
Under that rule the example above is **rejected** — no single line reaches 10.

So the minimum now belongs to the **product**, and lives in a new module
(`src/utils/minimumOrder.ts`) rather than as a patch to the old helper.
Per-variation enforcement survives as an explicit opt-in
(`enforce_minimum_per_variation`).

The user confirmed this direction before implementation, choosing "Combined
across variations (matches quote)" over keeping the current override behaviour.

## User journeys

1. As an admin, I want one setting that applies a minimum to every product, so
   I do not edit them one by one.
2. As an admin, I want to override or disable that minimum on a single product,
   without losing the product's data.
3. As an admin, I want to choose the unit — vial, piece, box or kit — so the
   customer-facing wording matches what I actually sell.
4. As a shopper, I want to see the minimum before I add to cart.
5. As a shopper, I want the cart to stop me and say what to fix.
6. As a shopper buying several strengths of one product, I want my combined
   quantity to count toward the minimum.

## Task report

### Part 1 — The rule (`aaa9395` → `b64de36`, `2a6c76d` → `59c3044`)

- **RED**: `npx vitest run src/utils/minimumOrder.test.ts` →
  `Failed to resolve import "./minimumOrder"`; later `8 failed` for the missing
  `validateCartMinimums`.
- **GREEN**: same command → `Tests 40 passed (40)`.

Resolution order: a product may opt out entirely, or override the universal
quantity and unit, or (by default) follow the universal setting. **An override
stands even when the universal switch is off** — turning the site-wide
requirement off means stopping it applying by default, not stripping a minimum
an admin set deliberately on one product.

Malformed input degrades to *no enforcement* rather than to a guess: a
non-integer quantity, an unrecognised unit, or a resolved quantity below 1 all
leave carts alone. Zero quantity passes, so a product absent from the cart never
blocks checkout.

`validateCartMinimums` groups by **product** when combining and by **variation**
when not. Three short lines of one combining product are one thing to fix, and
three copies of the same banner read as three separate problems.

### Part 2 — Migration (`d7e67aa`)

- **RED**: `ENOENT` on `20260828000000_universal_minimum_order.sql`.
- **GREEN**: `npx vitest run src/utils/minimumOrderMigration.test.ts` →
  `Tests 10 passed (10)`.

`use_universal_minimum` defaults **TRUE** so one change reaches every existing
product; FALSE would island each row and leave the universal control doing
nothing. `universal_minimum_order_enabled` seeds **'false'** so applying the
migration changes nothing for shoppers mid-session.

The sharpest test guards `minimum_order_quantity`, added by `20260713000000`
and already holding real values on live rows: re-adding or re-defaulting it here
would overwrite minimums in use today.

### Part 3 — Settings hook (`e7c1546` → `b2107f8`)

- **GREEN**: `npx vitest run src/hooks/useUniversalMinimum.test.ts` →
  `Tests 7 passed (7)`.

Mirrors `useFeatureFlags` in shape but **fails the opposite way**. That hook
fails OPEN so a settings outage never blanks the navigation; a minimum must fail
the other way — enforce *nothing* — because inventing a minimum would reject
valid carts and a shopper cannot tell that from a real rule.

### Part 4 — Admin panel (`2e8ebb6` → `7346601`)

- **GREEN**: `npx vitest run src/components/UniversalMinimumOrderPanel.test.tsx`
  → `Tests 9 passed (9)`.

Pinned above the catalogue in Admin → Products, where the client asked for it.
Two of the tests assert **copy**, because both prevent a support question: the
panel must say the setting reaches every product, and must say that a product
with its own override will ignore it.

### Part 5 — Cart enforcement (`1d47bf5` → `9b1c81d`)

- **RED**: `npx vitest run src/components/Cart.test.tsx` → `2 failed | 9 passed`.
- **GREEN**: same command → `Tests 11 passed (11)`.

The `universalMinimum` prop is **optional, and absent means no minimum**. Cart
renders in places that do not read site settings, and a cart silently refusing
to check out because a setting failed to load is indistinguishable, to the
shopper, from a real rule.

One assertion was **scoped, not weakened**: it matched the product name in the
banner *and* on the cart line, both correct. It now reads the banner by role and
still asserts the name plus the client's exact shortfall wording. The banner
gained `role="alert"` in the process — it is the reason a disabled button is
disabled.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | A product follows the universal setting by default | `minimumOrder.test.ts` — "follows the universal setting by default" | unit | PASS |
| 2 | **A per-product override stands even when the universal switch is off** | same — "honours a per-product override even when the universal switch is OFF" | unit | PASS |
| 3 | A product can opt out of minimums entirely | same — "lets one product opt out" | unit | PASS |
| 4 | A resolved quantity below 1 enforces nothing | same — "never enforces a minimum below one" | unit | PASS |
| 5 | **Variations combine by default; per-variation is opt-in** | same — "combines variations by default", "enforces per variation when the admin asks" | unit | PASS |
| 6 | **The client's 4+3+3 = 10 example passes** | same — "accepts the client's split across three variations" | unit | PASS |
| 7 | One violation per product, not per line | same — "reports one violation per product" | unit | PASS |
| 8 | Wording matches the client's copy, incl. "1 vial" and "3 boxes" | same — "customer-facing wording" | unit | PASS |
| 9 | An admin's own message replaces the generated notice | same — "prefers a message the admin wrote" | unit | PASS |
| 10 | Malformed settings resolve to no minimum, never a guess | same — "ignores a quantity that is not a positive whole number", "ignores a unit the admin UI could not have produced" | unit | PASS |
| 11 | The universal default is OFF | same — "defaults to OFF so applying the migration changes no shopper's cart" | unit | PASS |
| 12 | **The migration never re-declares `minimum_order_quantity`** | `minimumOrderMigration.test.ts` — "leaves the pre-existing column alone" | migration | PASS |
| 13 | Every product follows the universal setting until told otherwise | same — "has every product follow the universal setting" | migration | PASS |
| 14 | The unit is constrained in the database, not just the UI | same — "constrains the unit to the four the admin UI offers" | migration | PASS |
| 15 | Re-running never clobbers an admin's choice | same — "never clobbers a choice an admin has already made" | migration | PASS |
| 16 | **An unreadable setting enforces nothing** | `useUniversalMinimum.test.ts` — "falls back to NO minimum when the settings cannot be read" | unit | PASS |
| 17 | A failed save leaves the displayed setting untouched | same — "leaves the shown setting untouched when the write fails" | unit | PASS |
| 18 | The panel says the setting reaches every product | `UniversalMinimumOrderPanel.test.tsx` — "tells the admin plainly what turning it on will do" | unit | PASS |
| 19 | The panel says which products will ignore it | same — "says which products will ignore it" | unit | PASS |
| 20 | A quantity below 1 is refused before the write | same — "refuses to save a quantity below one" | unit | PASS |
| 21 | **A short product blocks checkout, in the client's words** | `Cart.test.tsx` — "blocks checkout", "names the product and the shortfall" | unit | PASS |
| 22 | **Variations of one product count together in the cart** | same — "counts variations of one product together" | unit | PASS |
| 23 | No setting supplied enforces nothing | same — "enforces nothing when no minimum setting was supplied at all" | unit | PASS |

## Coverage and known gaps

**Suite**: `npx vitest run` → `Tests 1657 passed (1657)`, zero failing tests.
The 2 failing test **files** are the long-standing orphans
(`checkoutPrefill.test.ts`, `useReturningCustomer.test.ts`) that import
implementations which have never existed in git history.

**Typecheck**: `npx tsc --noEmit -p tsconfig.app.json` → **57** errors, one
FEWER than the 58-error pre-change baseline. None in any file touched here.

### Closed since the first report

All four gaps named in the previous revision are now closed.

**Part 6 — the customer-facing notice (`aefdb4a` → `2a15f4d`).** The minimum is
stated on the product card and in the product details, and the detail view's
quantity selector opens AT the minimum. The two rules coexist, so the selector
floor takes the LARGER of the old per-line `resolveMinOrder` and the new
product-level rule — that never lowers a minimum an admin already relies on.

**Part 7 — per-product admin fields (`82a430b` → `f1d7016`).** All six controls,
extracted as `ProductMinimumOrderFields` rather than more markup inside a
1700-line dashboard. Controls hide rather than disable, and nothing is cleared
when switched off, so turning a rule back on restores the stored number.

Two real defects were fixed here, both found by the reproducer:

- `pickProductDbFields` is an **allowlist** and the only route into the
  `products` table. The five new columns were missing from it, so every save
  would have silently dropped them with no error to notice.
- The quantity input clamped to `>= 1` on every keystroke, making the field
  impossible to retype: clearing it snapped back to `1`, so typing `8` produced
  `18`. It now keeps a local draft while still pushing a clamped number up.

**Part 8 — `useCart` (`23d3cad` → `222d447`).** A new line now opens at the
product-level minimum, but only where a single line can be judged on its own: a
product with no variation, or one enforcing per variation. A combining
variation line is left alone, because clamping it would force the whole minimum
onto whichever strength was picked first and make a 4+3+3 split impossible to
enter. `useUniversalMinimum` also had to move above `useCart` in `App` — it was
being read one line before it was declared, which would have thrown at runtime.

**Part 9 — admin orders (`9196007` → `e163b37` → `bf4788e`).**
`validateOrderLineMinimums` projects `OrderLineItem` rows onto cart lines and
delegates to `validateCartMinimums`, so there is **one** implementation of the
rule rather than two that would eventually disagree. A line whose product has
left the catalogue is skipped rather than flagged.

The editor shows a **warning, not a block**. The client asked admin orders to
follow the minimum, but an admin editing an order *down* — cancelling ligwak
vials, correcting an overcount — has a legitimate reason to land under it, and
refusing the save would trap them mid-correction. The rule is made visible; the
judgement stays with the admin. **Flagged for the client**: if they want a hard
block on admin orders, that is a one-line change.

**Not applied to a live database.** As with reviews, every SQL guarantee is
asserted against the migration text.
`20260828000000_universal_minimum_order.sql` has not been run against Postgres.
Until it is, `resolveMinimumOrder` sees no override columns and every product
follows the (seeded-off) universal setting.
