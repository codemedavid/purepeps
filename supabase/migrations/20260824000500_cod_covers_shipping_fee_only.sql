-- Pure Peps — Correction: the payment option governs the SHIPPING FEE only.
--
-- 20260824000000/000100 were built on the wrong model: that a COD order pays
-- for nothing at checkout and hands the courier total_price + shipping_fee.
--
-- The actual rule is narrower. The items are ALWAYS bought online at checkout,
-- with a receipt, under both options. All the choice decides is the fee:
--
--   pay_now — items + shipping fee in one online transfer. Courier collects
--             nothing.
--   cod     — items online now; the courier collects the SHIPPING FEE ONLY.
--
-- Two consequences for enforcement, both fixed here:
--
--  1. A COD order MUST carry an online payment method and MAY carry a proof
--     URL. 20260824000100 wiped both to NULL on every COD insert — under the
--     corrected model that silently destroys the record of a real payment the
--     shopper just made, leaving an order that looks unpaid and a receipt no
--     admin can find. The wipe is removed and COD now falls under the same
--     "must name a method" rule as Pay Now.
--
--  2. The forgery concern the wipe was written for is unchanged and still
--     covered: payment_status/paid_total are reset below, so a crafted payload
--     still cannot assert that anything has been PAID. A proof URL on its own
--     claims nothing — an admin reviews it exactly as for a Pay Now order.
--
-- Money is untouched: no COD surcharge, and total_price/shipping_fee keep the
-- meanings they already had (total_price excludes shipping).
--
-- Idempotent; safe to re-run.

COMMENT ON COLUMN public.orders.payment_type IS
  'How the customer chose to settle the SHIPPING FEE: pay_now (fee paid online with the items) or cod (courier collects the shipping fee in cash). Items are paid online and proof is required under BOTH options. No COD surcharge.';

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

  -- The kill switch governs NEW checkouts only. A leftover claim inherits its
  -- parent order's payment_type, so enforcing it here too would strand an
  -- existing COD customer mid-batch the moment an admin switches COD off —
  -- punishing them for a decision taken after they ordered.
  IF NEW.payment_type = 'cod' AND NOT COALESCE(NEW.is_claim, false) THEN
    SELECT lower(btrim(s.value)) IN ('true', '1', 'yes')
    INTO v_cod_enabled
    FROM public.site_settings s
    WHERE s.id = 'cod_enabled';

    IF NOT COALESCE(v_cod_enabled, false) THEN
      RAISE EXCEPTION 'Paying the shipping fee on delivery is not available right now. Please choose Pay Now instead.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- BOTH options buy the items online, so both must name a method.
  --
  -- Claim add-ons are exempt: claim_group_buy_leftover (SECURITY DEFINER)
  -- creates them and they inherit the parent order's payment context rather
  -- than collecting a method of their own.
  --
  -- Admins are exempt: back-office flows legitimately create orders without a
  -- method (a linked order added to a group-buy parent, a phone order recorded
  -- by hand), and blocking those breaks admin tooling to guard against a
  -- shopper payload it cannot send.
  IF NOT COALESCE(NEW.is_claim, false) AND NOT public.is_admin() THEN
    IF NEW.payment_method_id IS NULL OR btrim(NEW.payment_method_id) = '' THEN
      RAISE EXCEPTION 'Please select an online payment method to continue.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- A newly placed order is unpaid and unconfirmed, whatever the payload says.
  -- This is what actually stops a forged "already paid" claim, for COD exactly
  -- as for Pay Now — the proof URL is reviewed, never trusted.
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

REVOKE ALL ON FUNCTION public.enforce_payment_type_on_order() FROM PUBLIC, anon, authenticated;

-- Trigger definition is unchanged from 20260824000100; re-asserted so this
-- migration is self-sufficient if replayed onto a fresh database.
DROP TRIGGER IF EXISTS trg_enforce_payment_type_on_order ON public.orders;
CREATE TRIGGER trg_enforce_payment_type_on_order
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payment_type_on_order();
