-- ===========================================================================
-- Pure Peps — Ligwak (incomplete kit) allocation.
--
-- When a group buy stops taking orders, the confirmed vials of each product
-- variation are packed into kits in the exact sequence the orders were placed.
-- Whole kits ship. The vials left over cannot be packed, and the customers
-- holding them are LIGWAK — their money has to come back.
--
-- FOUR tables, because they have four different lifetimes:
--
--   group_buy_kit_allocations         — the header for one (batch, product,
--                                       variation) queue. Draft while the admin
--                                       is previewing; LOCKED once approved.
--
--   group_buy_kit_allocation_entries  — the ledger: every participating order's
--                                       slice, in packing order. IMMUTABLE once
--                                       its allocation is locked. This is what
--                                       "later changes must not automatically
--                                       rearrange customers" means concretely.
--
--   ligwak_records                    — the refund WORKFLOW. Deliberately a
--                                       separate table from the ledger: the
--                                       allocation is frozen history, while a
--                                       refund moves through states, collects a
--                                       reference number and proof, and gets
--                                       notes added for weeks afterwards.
--
--   ligwak_audit_events               — append-only trail of every
--                                       recalculation, approval, status change
--                                       and refund.
--
-- WHY THE SNAPSHOTS
-- Records copy the customer's name/email/phone, the order number, the product
-- and variation names and the exact mg. Products get renamed and orders get
-- edited; a refund record must keep showing what was true when the allocation
-- was locked. Same reasoning as product_reviews.product_name.
--
-- EXPOSURE
-- These rows name customers, their contact details and what they are owed.
-- anon holds NO grant on any of them — there is no policy to get wrong and no
-- column to leak. Customers reach their own ligwak status only through the
-- order-history RPC, which returns public fields and never admin notes.
--
-- Idempotent; safe to re-run. Never drops a table.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Allocation header — one packing queue.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_buy_kit_allocations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              UUID NOT NULL REFERENCES public.group_buy_batches(id) ON DELETE CASCADE,

  product_id            TEXT NOT NULL,
  -- Snapshot: the catalog row may be renamed or deleted later.
  product_name          TEXT,
  -- NULL for a product with no variations — its own single queue.
  variation_id          TEXT,
  variation_name        TEXT,

  -- Snapshotted, NOT read from the product at display time. Editing a product's
  -- kit size later must never retroactively change an allocation that has
  -- already been locked and refunded against.
  kit_size              INTEGER NOT NULL CHECK (kit_size >= 1),

  total_confirmed_vials INTEGER NOT NULL DEFAULT 0 CHECK (total_confirmed_vials >= 0),
  complete_kits         INTEGER NOT NULL DEFAULT 0 CHECK (complete_kits >= 0),
  ligwak_vials          INTEGER NOT NULL DEFAULT 0 CHECK (ligwak_vials >= 0),

  -- draft  — computed, admin still previewing; may be recomputed freely.
  -- locked — approved and frozen; entries below may no longer move.
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','locked')),
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at             TIMESTAMPTZ,
  locked_by             UUID,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live allocation per queue. COALESCE because a NULL variation_id is a real
-- queue (an unvaried product), and NULLs do not collide in a plain unique index,
-- which would silently allow duplicate allocations for exactly those products.
CREATE UNIQUE INDEX IF NOT EXISTS group_buy_kit_allocations_stream_idx
  ON public.group_buy_kit_allocations (batch_id, product_id, COALESCE(variation_id, ''));

CREATE INDEX IF NOT EXISTS group_buy_kit_allocations_batch_status_idx
  ON public.group_buy_kit_allocations (batch_id, status);

-- ---------------------------------------------------------------------------
-- 2. Ledger — who filled which kit, in packing order.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_buy_kit_allocation_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id   UUID NOT NULL REFERENCES public.group_buy_kit_allocations(id) ON DELETE CASCADE,
  order_id        UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- 0-based position in the oldest-first queue.
  sequence        INTEGER NOT NULL CHECK (sequence >= 0),
  -- Copied from the order so the packing order stays auditable even if the
  -- order row is later touched.
  ordered_at      TIMESTAMPTZ NOT NULL,

  quantity        INTEGER NOT NULL CHECK (quantity >= 1),
  confirmed_qty   INTEGER NOT NULL CHECK (confirmed_qty >= 0),
  ligwak_qty      INTEGER NOT NULL CHECK (ligwak_qty >= 0),

  -- 1-based kits this order's vials landed in. Equal unless the order spans kits.
  first_kit_index INTEGER NOT NULL CHECK (first_kit_index >= 1),
  last_kit_index  INTEGER NOT NULL CHECK (last_kit_index >= 1),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The split must always add back up to what the customer ordered. Without this
  -- a bug in the allocator could quietly refund vials that were also shipped.
  CHECK (quantity = confirmed_qty + ligwak_qty),
  UNIQUE (allocation_id, order_id)
);

CREATE INDEX IF NOT EXISTS group_buy_kit_allocation_entries_alloc_seq_idx
  ON public.group_buy_kit_allocation_entries (allocation_id, sequence);

-- ---------------------------------------------------------------------------
-- 3. Ligwak records — the refund workflow.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ligwak_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id        UUID NOT NULL REFERENCES public.group_buy_kit_allocations(id) ON DELETE CASCADE,
  entry_id             UUID REFERENCES public.group_buy_kit_allocation_entries(id) ON DELETE SET NULL,
  batch_id             UUID NOT NULL REFERENCES public.group_buy_batches(id) ON DELETE CASCADE,
  order_id             UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- Snapshots. A renamed product or an edited order must not rewrite history.
  order_number         TEXT,
  ordered_at           TIMESTAMPTZ NOT NULL,
  customer_name        TEXT NOT NULL,
  customer_email       TEXT NOT NULL,
  customer_phone       TEXT,
  product_id           TEXT NOT NULL,
  product_name         TEXT,
  variation_id         TEXT,
  variation_name       TEXT,
  quantity_mg          NUMERIC,

  total_quantity       INTEGER NOT NULL CHECK (total_quantity >= 1),
  confirmed_quantity   INTEGER NOT NULL CHECK (confirmed_quantity >= 0),
  -- A record with no ligwak vial has no reason to exist.
  ligwak_quantity      INTEGER NOT NULL CHECK (ligwak_quantity >= 1),

  -- What is owed for the ligwak vials, measured against what was actually paid
  -- (see computeLigwakRefund: discount prorated, capped by paid_total).
  refund_amount        DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  -- The shipping portion of refund_amount, broken out for the admin. Non-zero
  -- only when the ENTIRE order is ligwak and the fee was prepaid (Pay Now).
  shipping_refunded    DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (shipping_refunded >= 0),

  -- How the customer paid, snapshotted for the dashboard.
  payment_type         TEXT,
  payment_status       TEXT,
  payment_method_name  TEXT,

  -- Separate from orders.payment_status: an order can be Paid and still owe a
  -- refund on three of its vials.
  --
  -- 'no_refund_required' is reached ONLY when the arithmetic says nothing is
  -- owed. It is deliberately NOT a synonym for COD: Cash on Delivery covers the
  -- shipping fee only, so a COD customer has already paid for their vials online
  -- and is owed that money back like anyone else.
  refund_status        TEXT NOT NULL DEFAULT 'for_review'
                         CHECK (refund_status IN (
                           'for_review',
                           'refund_pending',
                           'refund_processing',
                           'refunded',
                           'refund_failed',
                           'no_refund_required'
                         )),
  refund_reference     TEXT,
  refund_proof_url     TEXT,
  refunded_at          TIMESTAMPTZ,

  reason               TEXT,
  admin_notes          TEXT,
  customer_notified_at TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One record per order per queue, so a re-run cannot double-refund anyone.
  UNIQUE (allocation_id, order_id)
);

CREATE INDEX IF NOT EXISTS ligwak_records_batch_status_idx
  ON public.ligwak_records (batch_id, refund_status);
CREATE INDEX IF NOT EXISTS ligwak_records_order_idx
  ON public.ligwak_records (order_id);
-- The customer-facing history looks a customer up by address.
CREATE INDEX IF NOT EXISTS ligwak_records_email_idx
  ON public.ligwak_records (lower(customer_email));

-- ---------------------------------------------------------------------------
-- 4. Audit trail — append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ligwak_audit_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID REFERENCES public.group_buy_batches(id) ON DELETE CASCADE,
  allocation_id    UUID REFERENCES public.group_buy_kit_allocations(id) ON DELETE CASCADE,
  ligwak_record_id UUID REFERENCES public.ligwak_records(id) ON DELETE CASCADE,

  event_type       TEXT NOT NULL CHECK (event_type IN (
                     'locked',
                     'recalculated',
                     'approved',
                     'rejected',
                     'refund_status_changed',
                     'refund_recorded',
                     'customer_notified'
                   )),
  from_value       TEXT,
  to_value         TEXT,
  -- Free-form context: totals before/after a recalculation, amounts, notes.
  detail           JSONB,
  actor            UUID,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ligwak_audit_events_batch_occurred_idx
  ON public.ligwak_audit_events (batch_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ligwak_audit_events_record_occurred_idx
  ON public.ligwak_audit_events (ligwak_record_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Freeze the ledger once its allocation is locked.
--
--     "Once finalized, the allocation should be saved and locked. Later changes
--      should not automatically rearrange customers."
--
-- Enforced in the database rather than the RPC, so no future code path — an
-- admin console, a migration, a well-meaning script — can quietly reshuffle who
-- was ligwak after refunds have started going out.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_locked_allocation_entry_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM public.group_buy_kit_allocations
  WHERE id = COALESCE(NEW.allocation_id, OLD.allocation_id);

  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'This kit allocation is locked. Recalculate it explicitly to change who is ligwak.'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_locked_allocation_entries
  ON public.group_buy_kit_allocation_entries;
CREATE TRIGGER trg_freeze_locked_allocation_entries
  BEFORE INSERT OR UPDATE OR DELETE ON public.group_buy_kit_allocation_entries
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_allocation_entry_change();

-- ---------------------------------------------------------------------------
-- 6. RLS — admins only, on every table.
-- ---------------------------------------------------------------------------
ALTER TABLE public.group_buy_kit_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_buy_kit_allocation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ligwak_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ligwak_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.group_buy_kit_allocations FROM anon;
REVOKE ALL ON public.group_buy_kit_allocation_entries FROM anon;
REVOKE ALL ON public.ligwak_records FROM anon;
REVOKE ALL ON public.ligwak_audit_events FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_buy_kit_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_buy_kit_allocation_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ligwak_records TO authenticated;
GRANT SELECT, INSERT ON public.ligwak_audit_events TO authenticated;

-- Clean slate first, so no legacy permissive policy can OR-in a public read.
SELECT public._drop_all_policies('public.group_buy_kit_allocations'::regclass);
SELECT public._drop_all_policies('public.group_buy_kit_allocation_entries'::regclass);
SELECT public._drop_all_policies('public.ligwak_records'::regclass);
SELECT public._drop_all_policies('public.ligwak_audit_events'::regclass);

CREATE POLICY group_buy_kit_allocations_admin_all ON public.group_buy_kit_allocations
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY group_buy_kit_allocation_entries_admin_all ON public.group_buy_kit_allocation_entries
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY ligwak_records_admin_all ON public.ligwak_records
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY ligwak_audit_events_admin_all ON public.ligwak_audit_events
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
