-- Pure Peps — data-plane lockdown: enforce admin-only writes via RLS.
--
-- BEFORE this migration the catalog/config tables had RLS DISABLED and
-- `GRANT ALL ... TO anon` (see COMPLETE_SETUP.sql / add_tirzepatide_and_categories.sql),
-- so anyone holding the public anon key — which ships in the JS bundle — could
-- INSERT/UPDATE/DELETE products, prices, categories, etc. directly via the REST
-- API, completely bypassing the admin UI. The old client-side password gate
-- protected nothing server-side.
--
-- AFTER this migration:
--   * RLS is enabled on every storefront table.
--   * anon keeps ONLY the reads/inserts the public storefront genuinely needs.
--   * every admin write requires an authenticated session whose user is in
--     admin_users (public.is_admin(), from the admin_auth_roles migration).
--   * member PII (access_requests emails / payment proofs, order details) is no
--     longer enumerable via the anon REST API.
--
-- For each table we DROP ALL existing policies first, so legacy permissive
-- policies (e.g. "Admins can manage protocols" USING(true)) cannot OR-in and
-- silently re-open writes. Idempotent; safe to re-run. Run in the Supabase SQL
-- editor. Do NOT re-run the legacy GRANT-ALL/DISABLE-RLS setup scripts after this.

-- Helper: drop every policy on a table (clean slate before re-policing) so no
-- legacy permissive policy can OR-in and silently re-open writes.
-- NOTE: resolve schema+name from the regclass OID — regclass::text drops the
-- schema prefix when the schema is in search_path ('public.products' -> 'products'),
-- so matching pg_policies on a hardcoded 'public.%I' string would never match and
-- the helper would drop nothing.
CREATE OR REPLACE FUNCTION public._drop_all_policies(target regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  pol record;
  rel_schema text;
  rel_name text;
BEGIN
  SELECT n.nspname, c.relname
    INTO rel_schema, rel_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = target;

  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = rel_schema AND tablename = rel_name
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, rel_schema, rel_name);
  END LOOP;
END;
$$;

-- ===========================================================================
-- 1. Public-catalog tables: anon SELECT only, admin full write via is_admin().
--    These hold non-sensitive public catalog/config data the storefront renders
--    (and live-updates over Realtime, which also applies the SELECT policy).
-- ===========================================================================
DO $$
DECLARE
  t text;
  catalog_tables text[] := ARRAY[
    'products', 'product_variations', 'categories', 'payment_methods',
    'site_settings', 'protocols', 'faqs', 'couriers', 'shipping_locations',
    'coa_reports', 'guide_topics'
  ];
BEGIN
  FOREACH t IN ARRAY catalog_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      -- Undo the legacy blanket GRANT ALL TO anon.
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

      PERFORM public._drop_all_policies(format('public.%I', t)::regclass);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
        t || '_public_read', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
        t || '_admin_write', t
      );
    END IF;
  END LOOP;
END $$;

-- ===========================================================================
-- 2. orders — public INSERT at checkout, admin-only read/update.
--    No anon SELECT: checkout no longer reads the row back (Checkout.tsx drops
--    .select()), and public order tracking goes through the SECURITY DEFINER
--    get_order_details RPC. This stops anon from enumerating customer PII.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orders') THEN
    ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.orders FROM anon;
    GRANT INSERT ON public.orders TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;

    PERFORM public._drop_all_policies('public.orders'::regclass);

    -- Public can place an order, but only as a fresh, unpaid order.
    CREATE POLICY "orders_public_insert" ON public.orders
      FOR INSERT TO anon
      WITH CHECK (order_status = 'new' AND payment_status = 'pending');

    -- Admins see and manage everything.
    CREATE POLICY "orders_admin_all" ON public.orders
      FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ===========================================================================
-- 3. access_requests — public INSERT (pending only), admin-only read.
--    The old anon SELECT USING(true) let anyone harvest every member email,
--    amount, notes and payment_proof_url. Public email verification now goes
--    through get_access_status() (SECURITY DEFINER, below) instead of a direct
--    SELECT, so anon loses table read entirely.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='access_requests') THEN
    ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.access_requests FROM anon;
    GRANT INSERT ON public.access_requests TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_requests TO authenticated;

    PERFORM public._drop_all_policies('public.access_requests'::regclass);

    -- Public submission is always pending (also enforced by the force-pending trigger).
    CREATE POLICY "access_requests_public_insert" ON public.access_requests
      FOR INSERT TO anon
      WITH CHECK (status = 'pending');

    -- Admins read/manage the queue. (Status changes still flow through the
    -- approve-access Edge Function under the service role.)
    CREATE POLICY "access_requests_admin_all" ON public.access_requests
      FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Public, privacy-preserving access check: returns only 'approved'|'pending'|'none'
-- for an exact email — never exposes other members' rows. Mirrors useAccess's
-- decisive-status logic (most recent approved/rejected wins; else pending; else none).
CREATE OR REPLACE FUNCTION public.get_access_status(p_email text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := lower(trim(coalesce(p_email, '')));
  decisive text;
  has_pending boolean;
BEGIN
  IF normalized = '' THEN
    RETURN 'none';
  END IF;

  SELECT status INTO decisive
  FROM public.access_requests
  WHERE lower(email) = normalized AND status IN ('approved', 'rejected')
  ORDER BY updated_at DESC
  LIMIT 1;

  IF decisive = 'approved' THEN RETURN 'approved'; END IF;
  IF decisive = 'rejected' THEN RETURN 'none'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.access_requests
    WHERE lower(email) = normalized AND status = 'pending'
  ) INTO has_pending;

  RETURN CASE WHEN has_pending THEN 'pending' ELSE 'none' END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_access_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_access_status(text) TO anon, authenticated;

-- ===========================================================================
-- 4. promo_codes — public reads active codes; admin manages.
--    Usage is bumped through increment_promo_usage() (below), NOT a direct anon
--    UPDATE: a column grant would still let anon write ANY usage_count value
--    (re-enable an exhausted code, or DoS a limited one) and the old
--    read-then-write was racy. The RPC does an atomic, guarded increment.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='promo_codes') THEN
    ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.promo_codes FROM anon;
    GRANT SELECT ON public.promo_codes TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO authenticated;

    PERFORM public._drop_all_policies('public.promo_codes'::regclass);

    -- Public can read active codes (validation at checkout).
    CREATE POLICY "promo_codes_public_read" ON public.promo_codes
      FOR SELECT TO anon USING (active = true);

    -- Admins manage all codes. (Public usage bumps go through the RPC, which
    -- runs as definer and does not need an anon write policy.)
    CREATE POLICY "promo_codes_admin_all" ON public.promo_codes
      FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Atomic, guarded usage increment: only bumps an active code that is still under
-- its usage_limit, in a single statement (no TOCTOU). Returns true if it counted.
-- anon may EXECUTE it but has no direct UPDATE on promo_codes, so it cannot set
-- arbitrary usage_count values.
CREATE OR REPLACE FUNCTION public.increment_promo_usage(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE public.promo_codes
     SET usage_count = usage_count + 1,
         updated_at = NOW()
   WHERE id = p_id
     AND active = true
     AND (usage_limit IS NULL OR usage_count < usage_limit);
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_promo_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_promo_usage(uuid) TO anon, authenticated;

-- ===========================================================================
-- 5. promo_subscribers — public INSERT (email capture) only, admin-only read.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='promo_subscribers') THEN
    ALTER TABLE public.promo_subscribers ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.promo_subscribers FROM anon;
    GRANT INSERT ON public.promo_subscribers TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_subscribers TO authenticated;

    PERFORM public._drop_all_policies('public.promo_subscribers'::regclass);

    CREATE POLICY "promo_subscribers_public_insert" ON public.promo_subscribers
      FOR INSERT TO anon WITH CHECK (true);

    CREATE POLICY "promo_subscribers_admin_all" ON public.promo_subscribers
      FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Tidy up the helper so it is not left callable.
DROP FUNCTION IF EXISTS public._drop_all_policies(regclass);
