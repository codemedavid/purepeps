-- Pure Peps — real admin authentication + authorization foundation.
--
-- Replaces the old client-side password gate (a hardcoded string in the JS
-- bundle + a localStorage boolean) with Supabase Auth identities. Admins are
-- real rows in auth.users; this migration adds the authorization layer that the
-- RLS lockdown (see the data-plane migration) relies on:
--
--   * public.admin_users      — membership table: which auth users are admins
--   * public.is_admin()       — SECURITY DEFINER predicate used inside every
--                               admin RLS policy (and callable as an RPC by the
--                               client to decide whether to show the dashboard)
--   * public.promote_to_admin — operator helper to grant admin by email
--
-- Run in the Supabase SQL editor (as the postgres role) so the SECURITY DEFINER
-- functions are owned by a role that can bypass RLS on admin_users.

-- ---------------------------------------------------------------------------
-- Membership table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- is_admin(): the single source of truth for "is the current caller an admin".
-- SECURITY DEFINER so it can read admin_users regardless of that table's RLS,
-- which (a) lets it be used safely inside admin_users' own policies without
-- infinite recursion and (b) lets the storefront call it as an RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid()
  );
$$;

-- Lock down execution: only logged-in users ever need to ask "am I admin?".
-- (anon may keep it too — it simply returns false when auth.uid() is null.)
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS on admin_users: only admins can see or manage the admin list. These
-- policies call is_admin() (SECURITY DEFINER) so they do not recurse.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_users_admin_select" ON public.admin_users;
CREATE POLICY "admin_users_admin_select" ON public.admin_users
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_users_admin_write" ON public.admin_users;
CREATE POLICY "admin_users_admin_write" ON public.admin_users
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- promote_to_admin(email): operator-only helper to grant admin rights by email.
-- SECURITY DEFINER + revoked from client roles, so it can ONLY be invoked from
-- the SQL editor (postgres/service role) — a client can never self-promote.
-- Bootstrap the first admin with:
--     SELECT public.promote_to_admin('you@example.com');
-- after creating that user in Authentication → Users (or via signup, before
-- signups are disabled).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_to_admin(target_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE LOWER(email) = LOWER(target_email);
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No auth user found with email %', target_email
      USING HINT = 'Create the user in Authentication → Users first.';
  END IF;

  INSERT INTO public.admin_users (user_id, email)
  VALUES (uid, LOWER(target_email))
  ON CONFLICT (user_id) DO NOTHING;

  RETURN uid;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_to_admin(TEXT) FROM PUBLIC, anon, authenticated;
