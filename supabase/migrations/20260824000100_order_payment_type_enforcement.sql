-- Pure Peps — Server-side enforcement for the Pay Now / COD split.
--
-- Checkout inserts into public.orders DIRECTLY as the anon role (see
-- 20260621000000). That makes every client-side rule advisory only: anyone can
-- POST to PostgREST with whatever payload they like. So the real guarantees for
-- the payment split live here, not in Checkout.tsx.
--
-- Enforced:
--   * payment_type must be one of the two supported options.
--   * A Pay Now order must name an online payment method.
--   * A COD order must NOT carry a method or a proof — those fields are wiped
--     rather than trusted, so a crafted payload cannot fake "already paid".
--   * COD can be switched off shop-wide via the site_settings.cod_enabled row.
--     A client-only toggle would be no control at all against a direct insert.
--   * A newly placed order is ALWAYS unpaid and never pre-confirmed. This is the
--     insert-time half of "failed or unpaid Pay Now orders don't count as
--     confirmed"; the counting half is redefined in 20260824000150.
--
-- Claim add-ons (is_claim) are exempt from the method requirement: they are
-- created by claim_group_buy_leftover (SECURITY DEFINER) and inherit the parent
-- order's payment context rather than collecting a method of their own.
--
-- Admin inserts (public.is_admin()) skip the forced-unpaid reset so back-office
-- corrections can record an order that was already settled.
--
-- Idempotent; safe to re-run.

-- ===========================================================================
-- 1. COD kill switch. Defaults ON; admins flip it in Site Settings.
-- ===========================================================================
INSERT INTO public.site_settings (id, value, type, description)
VALUES (
  'cod_enabled',
  'true',
  'boolean',
  'When false, Cash on Delivery is hidden at checkout and rejected server-side.'
)
ON CONFLICT (id) DO NOTHING;

-- ===========================================================================
-- 2. Insert-time enforcement trigger.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.enforce_payment_type_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cod_enabled BOOLEAN;
BEGIN
  IF NEW.payment_type IS NULL OR NEW.payment_type NOT IN ('pay_now', 'cod') THEN
    RAISE EXCEPTION 'Please choose a payment option to continue.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.payment_type = 'cod' THEN
    -- The kill switch governs NEW checkouts only. A leftover claim inherits its
    -- parent order's payment_type, so enforcing it here too would strand an
    -- existing COD customer mid-batch the moment an admin switches COD off —
    -- punishing them for a decision taken after they ordered.
    IF NOT COALESCE(NEW.is_claim, false) THEN
      SELECT lower(btrim(s.value)) IN ('true', '1', 'yes')
      INTO v_cod_enabled
      FROM public.site_settings s
      WHERE s.id = 'cod_enabled';

      IF NOT COALESCE(v_cod_enabled, false) THEN
        RAISE EXCEPTION 'Cash on delivery is not available right now. Please choose Pay Now instead.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Wipe rather than validate: a COD order has paid nothing, so any method or
    -- receipt on the payload is noise at best and a forged claim at worst.
    NEW.payment_method_id   := NULL;
    NEW.payment_method_name := NULL;
    NEW.payment_proof_url   := NULL;

  ELSIF NOT COALESCE(NEW.is_claim, false) THEN
    IF NEW.payment_method_id IS NULL OR btrim(NEW.payment_method_id) = '' THEN
      RAISE EXCEPTION 'Please select an online payment method to continue.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- A newly placed order is unpaid and unconfirmed, whatever the payload says.
  IF NOT public.is_admin() THEN
    NEW.payment_status         := 'pending';
    NEW.paid_total             := NULL;
    NEW.refunded_total         := NULL;
    NEW.manually_confirmed_at  := NULL;
    NEW.manually_confirmed_by  := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_payment_type_on_order ON public.orders;
CREATE TRIGGER trg_enforce_payment_type_on_order
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payment_type_on_order();

-- ===========================================================================
-- 3. Re-assert the anon INSERT policy with the payment_type guard.
--
-- RLS WITH CHECK runs AFTER BEFORE-ROW triggers, so it sees the values the
-- trigger settled on — the two layers agree by construction.
--
-- The LATEST prior definition of this policy is 20260624000300 (claims
-- hardening), NOT 20260621000000 (lockdown). Every clause from it is carried
-- forward below — dropping is_claim = false would silently reopen the forged
-- claim hole that migration was written to close.
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'orders') THEN
    DROP POLICY IF EXISTS "orders_public_insert" ON public.orders;
    CREATE POLICY "orders_public_insert" ON public.orders
      FOR INSERT TO anon
      WITH CHECK (
        order_status = 'new'
        AND payment_status = 'pending'
        AND payment_type IN ('pay_now', 'cod')
        -- CRITICAL, carried forward from 20260624000300: without this, anon can
        -- POST is_claim=true with a victim's parent_order_id and forge a
        -- leftover claim, bypassing claim_group_buy_leftover's email auth and
        -- its cap re-check. Normal checkout inserts is_claim=false (the column
        -- default), so this costs the storefront nothing.
        AND is_claim = false
      );
  END IF;
END $$;
