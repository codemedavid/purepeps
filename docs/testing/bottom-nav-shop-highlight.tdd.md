# TDD Evidence — Bottom navigation Shop highlight

## Source plan

No `*.plan.md` was supplied. Journeys were derived during this TDD run from the
request: *"When the customer clicks Browse Catalog, they should be redirected to
the Shop section. The Shop button should automatically be highlighted in the
bottom navigation instead of Home."*

## User journeys

1. As a shopper on the storefront home screen, I want the hero's **Browse the
   catalog** button to take me to the Shop section, so that the bottom navigation
   shows me I am in Shop rather than Home.
2. As a shopper with an empty cart, I want the **Browse Catalog** button to take
   me to the Shop section, so that the bottom navigation highlights Shop.
3. As a shopper who has just opened the storefront, I want **Home** highlighted,
   so the navigation reflects where I actually am.

## Root cause

`src/components/Menu.tsx` wired the hero CTA to a `Menu`-local `scrollToProducts`:

```tsx
<Hero onShopAll={scrollToProducts} ... />
```

The scroll happened, but `MainApp` was never told the shopper had moved to the
catalog. `menuDestination` stayed `'home'`, and `StorefrontBottomNav` derives its
highlight from it (`shopIsCurrent = activeView === 'menu' && menuDestination === 'shop'`),
so Home stayed highlighted while the shopper looked at the Shop section.

The empty-cart **Browse Catalog** button was already correct
(`onContinueShopping={handleShop}` in `src/App.tsx`); only the hero CTA was broken.

## Fix

`Menu` now accepts an optional `onShopAll` from the storefront shell. `App` passes
`handleShop`, which sets `menuDestination` to `'shop'` **and** drives the existing
catalog scroll via `shopScrollRequest`. The `Menu`-local scroll remains the
fallback when no parent handler is supplied, so standalone `Menu` use is unchanged.

| File | Change |
|------|--------|
| `src/components/Menu.tsx` | Added optional `onShopAll` prop; `Hero` uses `onShopAll ?? scrollToProducts` |
| `src/App.tsx` | Passes `onShopAll={handleShop}` to `Menu` |

## Task report

### Task — hero Browse the catalog must highlight Shop

- **Summary.** Threaded the hero CTA up to the storefront shell so the bottom-nav
  destination follows the scroll.
- **Validation command.** `npx vitest run src/App.test.tsx`
- **RED output** (before the fix, at commit `5269294`):

  ```
  FAIL src/App.test.tsx > Storefront bottom navigation >
    highlights Shop instead of Home after the hero Browse the catalog button is used
  Error: expect(element).toHaveAttribute("aria-current", "page")
  Expected the element to have attribute:
    aria-current="page"
  Received:
    null
   Tests  1 failed | 1 passed (2)
  ```

  The failure is the intended business-logic defect: the Shop tab carries no
  `aria-current`. The sibling "highlights Home on first load" test passed in the
  same run, confirming the harness itself was sound and the failure was not setup
  noise.

- **GREEN output** (after the fix, at commit `748838f`):

  ```
   Test Files  1 passed (1)
        Tests  3 passed (3)
  ```

- **Guaranteed by the passing tests.** Using either catalog entry point moves the
  bottom-navigation highlight to Shop and clears it from Home, and a freshly
  loaded storefront highlights Home.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | A freshly loaded storefront highlights Home and not Shop | `src/App.test.tsx:highlights Home on first load` | integration | PASS | `npx vitest run src/App.test.tsx` |
| 2 | The hero "Browse the catalog" CTA moves the highlight to Shop and off Home | `src/App.test.tsx:highlights Shop instead of Home after the hero Browse the catalog button is used` | integration | PASS (RED→GREEN) | `npx vitest run src/App.test.tsx` |
| 3 | The empty-cart "Browse Catalog" button moves the highlight to Shop and off Home | `src/App.test.tsx:highlights Shop instead of Home after the empty cart Browse Catalog button is used` | integration | PASS (regression guard) | `npx vitest run src/App.test.tsx` |

Test 3 passed without any production change — that path was already wired
correctly. It is recorded as a regression guard, not as a RED-driven test.

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Targeted tests | `npx vitest run src/App.test.tsx` | 3 passed |
| Full suite | `npx vitest run` | 900 passed; 2 test files failed to collect (pre-existing, see gaps) |
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json` | No errors in `App.tsx`, `Menu.tsx`, or `App.test.tsx`; pre-existing errors elsewhere |
| Production build | `npm run build` | `✓ built in 4.03s` |

## Coverage and known gaps

- **No coverage measurement.** The repo has no `test:coverage` script and no
  `@vitest/coverage-v8` provider installed, so the 80% threshold could not be
  measured. Installing a coverage provider was out of scope for this fix.
- **Two pre-existing broken test files.** `src/utils/checkoutPrefill.test.ts` and
  `src/hooks/useReturningCustomer.test.ts` fail to collect because their
  implementation modules (`checkoutPrefill.ts`, `useReturningCustomer.ts`) do not
  exist in the repo. Verified pre-existing: with this change's source edits
  stashed, both files fail identically. Not touched by this work.
- **ESLint is broken repo-wide.** `npx eslint` crashes with
  `TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions'`
  — a `@typescript-eslint` / ESLint 9.36 version mismatch. Pre-existing and
  unrelated; lint could not be run on the changed files.
- **No refactor commit.** The final change is three focused edits with a
  documented prop; there was nothing to clean up after GREEN.
- **Not covered by automated tests.** That the smooth scroll visually lands on the
  catalog is not asserted (jsdom stubs `scrollIntoView`). The scroll mechanism was
  already exercised by the existing bottom-nav Shop button and is unchanged.

## Merge evidence

If the checkpoint commits are squashed, preserve this summary:

- `5269294` — `test:` RED. New journey test failed on the missing `aria-current`
  on the Shop tab after the hero CTA.
- `748838f` — `fix:` GREEN. `Menu` accepts `onShopAll`; `App` passes `handleShop`.
  Same target rerun: 3 passed. Full suite 900 passed, build green.
- No refactor commit; nothing required cleanup.
