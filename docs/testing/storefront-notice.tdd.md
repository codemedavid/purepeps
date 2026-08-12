# TDD Evidence — Complete Storefront Notice Management

## Delivered behavior

- Admins manage multiple draft, published, and archived notices from Admin → Settings.
- Each notice has structured content, a curated style, priority, audience, page targets,
  Asia/Manila schedule, and once/session/every-visit frequency.
- Published notices can be updated without resetting acknowledgements or explicitly published as a
  new version. Only drafts and archives can be permanently deleted.
- The storefront requests one server-selected notice per page/view. Browser and session
  acknowledgements are versioned; a hard-coded legal notice remains the retrieval-failure fallback.
- Anonymous statistics retain only per-version impression and acknowledgement totals.

## Red/green slices

| Slice | RED evidence | GREEN coverage |
|---|---|---|
| Versioned acknowledgements | Four missing helper failures | ID/version keys and once/session/every-visit stores |
| Public query and analytics | Six failures against the legacy `site_settings` hook | RPC mapping, empty result, fallback, impression/acknowledgement RPC |
| Storefront gate | Five failures against the unscoped legacy gate | Page/audience arguments, counters, persistence, version reset |
| Curated modal styles | Missing `data-style`/style icon | Info, warning, success, and critical style mapping |
| Publish rules and Manila dates | Five missing helper failures | Required fields, pages, schedule ordering, UTC conversion |
| Admin lifecycle hook | Missing module | List/stat merge, draft insert, versioned publish, validation |
| Admin manager | Six failures against the single-notice editor | Overview, create/save, validation, targeting controls, preview, lifecycle actions |
| Shared access state | Missing context module | One access resolution shared across public consumers |
| Database contract | Static migration drift guard | Tables, RLS, RPC matching/order, event whitelist, legacy preservation |

## Verification

- Notice-focused suites: all passing.
- Full `npm test`: **870 passed**; the only failures are the two pre-existing suites importing
  missing `checkoutPrefill.ts` and `useReturningCustomer.ts` modules.
- `npm run build`: production build succeeds.
- `npx tsc -p tsconfig.app.json --noEmit`: the repository still has its existing unrelated type
  errors; filtered output contains no notice-management, access-context, App, or Supabase type errors.
- `npm run lint`: cannot start because the repository's installed ESLint and
  `@typescript-eslint/no-unused-expressions` versions are incompatible.
- `git diff --check`: clean.

## Database rollout

Apply `supabase/migrations/20260812130000_storefront_notice_management.sql` before deploying the
frontend. It creates the protected notice/stat tables and narrow RPCs, then migrates the legacy
`site_settings` notice once without deleting rollback keys.
