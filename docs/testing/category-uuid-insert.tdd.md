# TDD Evidence — Category insert must not send a client-generated id

## Source plan

No `*.plan.md` provided. Journeys derived from a production runtime error report:

```
POST /categories?select=* → 400
Error adding category: { code: "22P02", message: "invalid input syntax for type uuid: \"new\"" }
```

## Root cause

The live `public.categories` table defines `id` as a `uuid` column with a
`gen_random_uuid()` default (verified against the remote database). Its rows and
the `products.category` foreign key both use uuid values. However
`addCategory` sent a **client-generated kebab-case slug** as `id` (derived from
the category name — e.g. `"new"`), which Postgres rejects for a uuid column with
error `22P02` (`invalid input syntax for type uuid`).

Note: the migration files (`20250110000000_convert_to_peptide_business.sql`,
`20250901005107_calm_pine.sql`) still declare `categories.id` as `text`; the
remote database has since diverged to `uuid`. The fix targets the live schema.

## User journeys

- As an admin, I want to add a new category so that it saves successfully
  instead of failing with a uuid type error.
- As an admin editing a category, I still want to see its (read-only) system id.

## Task report

| Behavior | Validation command | RED → GREEN | Guarantee |
|----------|--------------------|-------------|-----------|
| `addCategory` omits `id` so the DB generates the uuid | `npx vitest run src/hooks/useCategories.test.ts` | RED (`expected { id: undefined, … } to not have property "id"`) → GREEN | Insert payload never contains a client `id`; the uuid primary key is assigned by `gen_random_uuid()` |

### RED evidence

```
FAIL src/hooks/useCategories.test.ts > addCategory > does not send a client-supplied id
AssertionError: expected { id: undefined, …(5) } to not have property "id"
  Tests  1 failed | 9 passed (10)
```

### GREEN evidence

```
npx vitest run src/hooks/useCategories.test.ts
Test Files  1 passed (1)
     Tests  10 passed (10)

npx tsc --noEmit    → clean (no category-related type errors)
npx vitest run      → Test Files 61 passed (61) | Tests 735 passed (735)
```

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | `addCategory` does not send a client-supplied `id`; the DB generates the uuid | `src/hooks/useCategories.test.ts:does not send a client-supplied id — the DB generates the uuid primary key` | unit | PASS | `npx vitest run src/hooks/useCategories.test.ts` |
| 2 | `addCategory` still forwards name/icon/etc. to the insert | `src/hooks/useCategories.test.ts:inserts a new category` | unit | PASS | same |
| 3 | Insert errors propagate to the caller | `src/hooks/useCategories.test.ts:throws on insert error` | unit | PASS | same |

## Changes

- `src/hooks/useCategories.ts` — `addCategory` signature now `Omit<Category, 'id' | 'created_at' | 'updated_at'>`; `id` removed from the insert payload.
- `src/components/CategoryManager.tsx` — removed the client slug "Category ID" input and its kebab-case validation from the add form; the add flow strips `id` before calling `addCategory`; the ID field is now shown read-only in edit mode only.

## Coverage and known gaps

- Full suite green: 735/735 tests, `tsc --noEmit` clean.
- Out of scope / follow-up: the migration files still declare `categories.id`
  as `text` and have drifted from the live `uuid` schema. A reconciling
  migration would be worthwhile but is not required to fix the reported error.
- The unrelated console warning `VITE_POSTHOG_KEY is not set` is expected when
  the PostHog key is absent and is not addressed here.
