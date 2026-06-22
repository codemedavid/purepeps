# TDD Evidence — Migrate image uploads to ImageKit.io

**Source plan:** none — journeys derived during this TDD run from the request
"change image upload of products and everything to use ImageKit.io".

## User journeys

1. As an admin, I want product (and all other) images to upload to ImageKit so
   that image storage no longer depends on Supabase Storage buckets.
2. As a developer, I want a single upload helper (`uploadToImageKit`) so every
   existing call site (`useImageUpload` hook + the direct `LeftoverClaimPanel`
   upload) shares one code path.
3. As a developer, I want uploads to fail with a clear error when ImageKit keys
   are missing or ImageKit rejects the request.
4. As an admin, I want image deletes to keep working even though we only persist
   the public URL (not the ImageKit fileId).

## Task report

| Task | Summary | Validation command | Result |
|------|---------|--------------------|--------|
| RED tests | Added `src/lib/imagekit.test.ts` before any impl | `npx vitest run src/lib/imagekit.test.ts` | RED — `Failed to resolve import "./imagekit"` |
| Implement lib | Added `src/lib/imagekit.ts` (`uploadToImageKit`, `deleteFromImageKit`) | `npx vitest run src/lib/imagekit.test.ts` | GREEN — 5 passed |
| Migrate hook | Rewrote `useImageUpload` to call the lib, kept validation + progress | `npx vitest run` | GREEN — 330 passed |
| Migrate direct upload | Replaced `supabase.storage` call in `LeftoverClaimPanel` | `npx vitest run` | GREEN — 330 passed |
| Typecheck / build | — | `npx tsc --noEmit` / `npx vite build` | PASS / built |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Upload POSTs the file to the ImageKit upload endpoint and returns the public url | `src/lib/imagekit.test.ts:uploads the file ... returns the public url` | unit | PASS |
| 2 | The private key is never sent as a form field — only a derived HMAC signature, token, and expiry | same test, `privateKey`/`signature` assertions | unit | PASS |
| 3 | An ImageKit error response surfaces the ImageKit message | `...throws a helpful error when ImageKit responds with an error` | unit | PASS |
| 4 | Missing keys throw a "not configured" error before any network call | `...throws when the ImageKit keys are not configured` | unit | PASS |
| 5 | Delete resolves the fileId by name, then DELETEs it with Basic auth | `deleteFromImageKit > looks the file up by name then deletes it by id` | unit | PASS |
| 6 | Delete is best-effort: a missing file does not throw | `...does not throw when the file cannot be found` | unit | PASS |

## Coverage and known gaps

- Full suite: **330 passed (30 files)** via `npx vitest run`.
- `npx tsc --noEmit`: clean. `npx vite build`: succeeds.
- ESLint could not run: the repo's ESLint/`@typescript-eslint` versions are
  incompatible (`no-unused-expressions` rule crashes). Pre-existing — it crashes
  identically on untouched files (`src/lib/supabase.ts`). Not introduced here.

## Security note (must address before production)

`VITE_*` env vars are inlined into the public client bundle, so
`VITE_IMAGEKIT_PRIVATE_KEY` is readable by anyone who loads the site. This was an
explicit, user-approved trade-off for a backend-less setup. To harden:

1. Rotate the ImageKit private key (it was shared in plaintext and is now public).
2. Move `signRequest` + `deleteFromImageKit` behind a server endpoint (e.g. a
   Supabase Edge Function — the repo already has `approve-access`) that holds the
   private key as a server-only secret and returns only `{ token, expire, signature }`.
   Only `src/lib/imagekit.ts` changes; all call sites stay the same.
