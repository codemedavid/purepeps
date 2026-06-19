# Admin Authentication & Data-Plane Lockdown — Setup

This replaces the old client-side admin password with real **Supabase Auth** and
locks down the database so admin-only operations are enforced server-side by RLS.

## What changed (security summary)

- **Before:** the admin login checked a hardcoded password shipped in the JS
  bundle, and "logged in" was just `localStorage.peptide_admin_auth === 'true'`.
  Worse, the catalog tables had RLS **disabled** with `GRANT ALL TO anon`, so the
  public anon key (also in the bundle) could create/edit/delete products, prices,
  etc. directly via the REST API. The login protected nothing server-side.
- **After:** admins are real `auth.users`, gated by membership in `admin_users`
  (`public.is_admin()`). RLS is enabled on every storefront table; anon keeps only
  the reads/inserts the public site needs; all admin writes require an
  authenticated admin. Member PII (access-request emails, payment proofs, order
  details) is no longer enumerable via the anon API.

## Apply order (run once, in the Supabase SQL editor)

Run these migrations in order:

1. `migrations/20260620000000_admin_auth_roles.sql` — `admin_users`, `is_admin()`, `promote_to_admin()`
2. `migrations/20260621000000_lockdown_data_plane.sql` — RLS + policies + grants for all tables

> ⚠️ After applying these, do **not** re-run the legacy full-schema setup scripts
> (`COMPLETE_SETUP.sql`, `complete_schema.sql`, `MASTER_REPLICATION_SCRIPT.sql`,
> `add_tirzepatide_and_categories.sql`, `seed_products.sql`) — they `DISABLE ROW
> LEVEL SECURITY` and `GRANT ALL TO anon`, which would re-open the data plane.

## Bootstrap the first admin

1. **Create the user.** Supabase Dashboard → Authentication → Users → *Add user*
   (email + password). Or let them sign up once, then disable signups (next step).
2. **Grant admin** in the SQL editor:
   ```sql
   SELECT public.promote_to_admin('you@example.com');
   ```
   `promote_to_admin` is `SECURITY DEFINER` and revoked from client roles, so it
   can only be run from the SQL editor — no one can self-promote from the app.
3. Sign in at `/admin` with that email + password.

## Add / remove admins

- **Add:** create the user (step 1 above), then `SELECT public.promote_to_admin('them@example.com');`
- **Remove:** `DELETE FROM public.admin_users WHERE email = 'them@example.com';`
  (Optionally also delete the user under Authentication → Users.)

## Required Supabase project settings

- **Disable open signups:** Authentication → Providers → Email → turn **off**
  "Allow new users to sign up". Admins are provisioned manually; the storefront
  itself never signs anyone in. (Even if a stray user signed up, they would not be
  in `admin_users`, so they get no admin access — this is just hygiene.)
- **Edge Function:** redeploy `approve-access`. It now authorizes via the caller's
  admin JWT, so the old `ADMIN_PASSWORD` secret is no longer used and can be
  deleted. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
  are injected automatically.

## Post-deploy verification

- Sign in at `/admin` as the admin → dashboard loads; product/category CRUD works.
- Sign in as a non-admin user → "not authorized" and no session remains.
- Public storefront (logged out): menu, categories, checkout, Get Access, order
  tracking, FAQ, COA, protocols all still work.
- **The core proof** — a raw anon write must now be rejected:
  ```bash
  curl -i -X POST "$VITE_SUPABASE_URL/rest/v1/products" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"name":"hack","description":"x","category":"research","base_price":1}'
  # expect 401/403 (RLS denies) — previously this would have inserted a row.
  ```

## Optional later hardening

- Enroll admins in **TOTP MFA** (Supabase Auth supports `mfa.enroll`).
- Build a small in-dashboard admin-management UI (insert/delete `admin_users`)
  for non-technical operators, gated by `is_admin()`.
