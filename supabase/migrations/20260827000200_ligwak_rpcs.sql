-- ===========================================================================
-- Pure Peps — Ligwak allocation RPCs.
--
-- The database is authoritative for WHO is ligwak. The TypeScript engine in
-- src/utils/ligwak.ts is a mirror that drives the admin preview, exactly as
-- countsAsConfirmedOrder mirrors the confirmed_quantity filter — so the number
-- an admin approves is never one the database disagrees with.
--
-- THE KEY STRUCTURAL DECISION
-- lock_kit_allocation does NOT re-implement the allocation. It calls
-- preview_kit_allocation and persists that exact JSON. Preview and lock
-- therefore cannot drift by construction: what the admin approved on screen is
-- literally the payload that gets written.
--
-- Every function: SECURITY DEFINER, pinned search_path, explicit is_admin()
-- guard, no anon grant. Mirrors 20260624000000_group_buy_lifecycle.sql.
--
-- Idempotent; safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. preview_kit_allocation — read-only. Computes the whole picture and writes
--    nothing, so an admin can preview as often as they like.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_kit_allocation(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to preview a kit allocation.';
  END IF;

  WITH
  -- Only ELIGIBLE, CONFIRMED orders fill a kit. This predicate is copied from
  -- the confirmed_quantity FILTER in get_group_buy_progress so that ligwak is
  -- computed over exactly the demand the group-buy caps already counted.
  -- Failed, cancelled and unpaid Pay Now orders are excluded; COD is unpaid by
  -- design and counts; an already-paid order whose balance receipt is under
  -- review ('submitted' with paid_total set) must not silently drop out.
  eligible AS (
    SELECT
      o.id                                    AS order_id,
      o.order_number,
      o.created_at,
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      o.payment_type,
      o.payment_status,
      o.payment_method_name,
      o.subtotal,
      o.total_price,
      o.shipping_fee,
      o.paid_total,
      o.refunded_total,
      (elem->>'product_id')                   AS product_id,
      (elem->>'product_name')                 AS product_name,
      (elem->>'variation_id')                 AS variation_id,
      (elem->>'variation_name')               AS variation_name,
      NULLIF(elem->>'quantity_mg', '')::numeric AS quantity_mg,
      COALESCE((elem->>'quantity')::numeric, 0) AS quantity,
      COALESCE((elem->>'price')::numeric, 0)    AS price
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.order_items) AS elem
    WHERE o.group_buy_batch_id = p_batch_id
      AND (elem->>'product_id') IS NOT NULL
      AND o.order_status NOT IN ('cancelled', 'new')
      AND (o.manually_confirmed_at IS NOT NULL
           OR (o.payment_status NOT IN ('failed', 'refunded', 'partially_refunded')
               AND (o.payment_type = 'cod'
                    OR o.payment_status = 'paid'
                    OR (o.payment_status = 'submitted'
                        AND o.paid_total IS NOT NULL))))
  ),
  -- One row per (queue, order): repeated lines of the same item are summed, so
  -- a customer who added the same vial twice holds one place in the queue.
  per_order AS (
    SELECT
      product_id,
      variation_id,
      order_id,
      MAX(order_number)                 AS order_number,
      MIN(created_at)                   AS created_at,
      MAX(customer_name)                AS customer_name,
      MAX(customer_email)               AS customer_email,
      MAX(customer_phone)               AS customer_phone,
      MAX(payment_type)                 AS payment_type,
      MAX(payment_status)               AS payment_status,
      MAX(payment_method_name)          AS payment_method_name,
      MAX(product_name)                 AS product_name,
      MAX(variation_name)               AS variation_name,
      MAX(quantity_mg)                  AS quantity_mg,
      MAX(subtotal)                     AS subtotal,
      MAX(total_price)                  AS total_price,
      MAX(shipping_fee)                 AS shipping_fee,
      MAX(paid_total)                   AS paid_total,
      MAX(refunded_total)               AS refunded_total,
      MAX(price)                        AS price,
      SUM(quantity)                     AS quantity
    FROM eligible
    GROUP BY product_id, variation_id, order_id
    HAVING SUM(quantity) > 0
  ),
  -- Vials per complete kit, resolved variation -> product -> 10. The same chain
  -- resolveKitSize() uses on the client.
  sized AS (
    SELECT
      po.*,
      COALESCE(pv.vials_per_kit, p.vials_per_kit, 10) AS kit_size
    FROM per_order po
    LEFT JOIN public.products p
      ON p.id::text = po.product_id
    LEFT JOIN public.product_variations pv
      ON pv.id::text = po.variation_id
  ),
  -- Pack the queue. ORDER BY placement time, then order number, then id: a total
  -- order, so re-running this can never swap which customer is ligwak when two
  -- orders share a timestamp.
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER w - 1 AS sequence,
      SUM(s.quantity) OVER (
        PARTITION BY s.product_id, COALESCE(s.variation_id, '')
        ORDER BY s.created_at, s.order_number, s.order_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS running_end,
      SUM(s.quantity) OVER (
        PARTITION BY s.product_id, COALESCE(s.variation_id, '')
      ) AS stream_total
    FROM sized s
    WINDOW w AS (
      PARTITION BY s.product_id, COALESCE(s.variation_id, '')
      ORDER BY s.created_at, s.order_number, s.order_id
    )
  ),
  -- Split each order's vials at the packed/ligwak boundary.
  split AS (
    SELECT
      r.*,
      FLOOR(r.stream_total / r.kit_size)               AS complete_kits,
      FLOOR(r.stream_total / r.kit_size) * r.kit_size  AS packed_vials,
      GREATEST(0, LEAST(
        r.quantity,
        FLOOR(r.stream_total / r.kit_size) * r.kit_size - (r.running_end - r.quantity)
      ))                                               AS confirmed_qty
    FROM ranked r
  ),
  allocated AS (
    SELECT
      sp.*,
      sp.quantity - sp.confirmed_qty                             AS ligwak_qty,
      FLOOR((sp.running_end - sp.quantity) / sp.kit_size) + 1    AS first_kit_index,
      FLOOR((sp.running_end - 1) / sp.kit_size) + 1              AS last_kit_index
    FROM split sp
  ),
  -- An order ships unless EVERY vial it holds, across every queue, is ligwak.
  -- Only then does a prepaid shipping fee come back.
  order_totals AS (
    SELECT
      order_id,
      SUM(quantity) AS order_vials,
      SUM(quantity - confirmed_qty) AS order_ligwak_vials
    FROM allocated
    GROUP BY order_id
  ),
  -- The shipping fee is charged once per order, so only ONE record of a wholly
  -- ligwak order may claim it back.
  shipping_claim AS (
    SELECT DISTINCT ON (a.order_id)
      a.order_id, a.product_id, a.variation_id
    FROM allocated a
    JOIN order_totals ot ON ot.order_id = a.order_id
    WHERE a.ligwak_qty > 0
      AND ot.order_vials = ot.order_ligwak_vials
    ORDER BY a.order_id, a.product_id, COALESCE(a.variation_id, '')
  ),
  -- What the customer is owed, measured against what they ACTUALLY paid:
  -- the promo discount prorated onto the refunded vials, capped by paid_total
  -- less anything already refunded. Mirrors computeLigwakRefund().
  priced AS (
    SELECT
      a.*,
      ot.order_vials,
      ot.order_ligwak_vials,
      (sc.order_id IS NOT NULL) AS claims_shipping,
      ROUND(
        a.price
        * CASE WHEN COALESCE(a.subtotal, 0) > 0
               THEN COALESCE(a.total_price, 0) / a.subtotal
               ELSE 1 END
        * a.ligwak_qty
      , 2) AS vials_refund,
      CASE
        WHEN sc.order_id IS NOT NULL AND a.payment_type IS DISTINCT FROM 'cod'
        THEN GREATEST(0, COALESCE(a.shipping_fee, 0))
        ELSE 0
      END AS shipping_owed,
      GREATEST(0, COALESCE(a.paid_total, 0) - COALESCE(a.refunded_total, 0)) AS headroom
    FROM allocated a
    JOIN order_totals ot ON ot.order_id = a.order_id
    LEFT JOIN shipping_claim sc
      ON sc.order_id = a.order_id
     AND sc.product_id = a.product_id
     AND COALESCE(sc.variation_id, '') = COALESCE(a.variation_id, '')
  ),
  final AS (
    SELECT
      pr.*,
      LEAST(pr.vials_refund + pr.shipping_owed, pr.headroom) AS refund_amount
    FROM priced pr
  ),
  -- One header per queue, with its ledger nested inside.
  allocations AS (
    SELECT
      f.product_id,
      MAX(f.product_name)   AS product_name,
      f.variation_id,
      MAX(f.variation_name) AS variation_name,
      MAX(f.kit_size)       AS kit_size,
      MAX(f.stream_total)   AS total_confirmed_vials,
      MAX(f.complete_kits)  AS complete_kits,
      MAX(f.stream_total) - MAX(f.packed_vials) AS ligwak_vials,
      jsonb_agg(
        jsonb_build_object(
          'order_id',        f.order_id,
          'order_number',    f.order_number,
          'sequence',        f.sequence,
          'ordered_at',      f.created_at,
          'customer_name',   f.customer_name,
          'quantity',        f.quantity,
          'confirmed_qty',   f.confirmed_qty,
          'ligwak_qty',      f.ligwak_qty,
          'first_kit_index', f.first_kit_index,
          'last_kit_index',  f.last_kit_index
        ) ORDER BY f.sequence
      ) AS entries
    FROM final f
    GROUP BY f.product_id, f.variation_id
  ),
  records AS (
    SELECT
      jsonb_build_object(
        'order_id',            f.order_id,
        'order_number',        f.order_number,
        'ordered_at',          f.created_at,
        'customer_name',       f.customer_name,
        'customer_email',      f.customer_email,
        'customer_phone',      f.customer_phone,
        'product_id',          f.product_id,
        'product_name',        f.product_name,
        'variation_id',        f.variation_id,
        'variation_name',      f.variation_name,
        'quantity_mg',         f.quantity_mg,
        'total_quantity',      f.quantity,
        'confirmed_quantity',  f.confirmed_qty,
        'ligwak_quantity',     f.ligwak_qty,
        'refund_amount',       f.refund_amount,
        'shipping_refunded',   GREATEST(0, f.refund_amount - f.vials_refund),
        'payment_type',        f.payment_type,
        'payment_status',      f.payment_status,
        'payment_method_name', f.payment_method_name,
        -- No Refund Required is reached only when the arithmetic says nothing is
        -- owed, NEVER from the payment type. COD covers the shipping fee only,
        -- so a COD customer has already paid for their vials online.
        'refund_status',       CASE WHEN f.refund_amount > 0
                                    THEN 'for_review'
                                    ELSE 'no_refund_required' END,
        'reason',              'Included in the final incomplete kit when the group buy closed ('
                                 || f.kit_size || ' vials per kit).'
      ) AS record
    FROM final f
    WHERE f.ligwak_qty > 0
  )
  SELECT jsonb_build_object(
    'batch_id',    p_batch_id,
    'allocations', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'product_id',            a.product_id,
          'product_name',          a.product_name,
          'variation_id',          a.variation_id,
          'variation_name',        a.variation_name,
          'kit_size',              a.kit_size,
          'total_confirmed_vials', a.total_confirmed_vials,
          'complete_kits',         a.complete_kits,
          'ligwak_vials',          a.ligwak_vials,
          'entries',               a.entries
        ) ORDER BY a.product_name NULLS LAST, a.variation_name NULLS LAST
      ) FROM allocations a
    ), '[]'::jsonb),
    'records', COALESCE((SELECT jsonb_agg(r.record) FROM records r), '[]'::jsonb),
    'totals', (
      SELECT jsonb_build_object(
        'affected_orders', COUNT(DISTINCT f.order_id),
        'ligwak_vials',    COALESCE(SUM(f.ligwak_qty), 0),
        'refund_owed',     COALESCE(SUM(f.refund_amount), 0)
      ) FROM final f WHERE f.ligwak_qty > 0
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_kit_allocation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_kit_allocation(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. lock_kit_allocation — persist the previewed allocation and freeze it.
--
--    Persists the OUTPUT of preview_kit_allocation rather than recomputing, so
--    what the admin approved is literally what is written.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_kit_allocation(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview       JSONB;
  v_allocation    JSONB;
  v_entry         JSONB;
  v_record        JSONB;
  v_allocation_id UUID;
  v_entry_id      UUID;
  v_locked        INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to lock a kit allocation.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_buy_kit_allocations
    WHERE batch_id = p_batch_id AND status = 'locked'
  ) THEN
    RAISE EXCEPTION 'This batch already has a locked kit allocation. Recalculate it explicitly to change who is ligwak.'
      USING ERRCODE = 'unique_violation';
  END IF;

  v_preview := public.preview_kit_allocation(p_batch_id);

  -- A previous draft is disposable; only locked allocations are protected.
  DELETE FROM public.group_buy_kit_allocations
  WHERE batch_id = p_batch_id AND status = 'draft';

  FOR v_allocation IN SELECT * FROM jsonb_array_elements(v_preview->'allocations')
  LOOP
    INSERT INTO public.group_buy_kit_allocations (
      batch_id, product_id, product_name, variation_id, variation_name,
      kit_size, total_confirmed_vials, complete_kits, ligwak_vials,
      status, locked_at, locked_by
    ) VALUES (
      p_batch_id,
      v_allocation->>'product_id',
      v_allocation->>'product_name',
      v_allocation->>'variation_id',
      v_allocation->>'variation_name',
      (v_allocation->>'kit_size')::int,
      (v_allocation->>'total_confirmed_vials')::int,
      (v_allocation->>'complete_kits')::int,
      (v_allocation->>'ligwak_vials')::int,
      -- Inserted as draft so the freeze trigger lets the ledger in; flipped to
      -- locked below, once its entries are safely written.
      'draft', now(), auth.uid()
    )
    RETURNING id INTO v_allocation_id;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_allocation->'entries')
    LOOP
      INSERT INTO public.group_buy_kit_allocation_entries (
        allocation_id, order_id, sequence, ordered_at,
        quantity, confirmed_qty, ligwak_qty, first_kit_index, last_kit_index
      ) VALUES (
        v_allocation_id,
        (v_entry->>'order_id')::uuid,
        (v_entry->>'sequence')::int,
        (v_entry->>'ordered_at')::timestamptz,
        (v_entry->>'quantity')::int,
        (v_entry->>'confirmed_qty')::int,
        (v_entry->>'ligwak_qty')::int,
        (v_entry->>'first_kit_index')::int,
        (v_entry->>'last_kit_index')::int
      )
      RETURNING id INTO v_entry_id;

      -- The matching ligwak record, if this order lost vials in this queue.
      IF (v_entry->>'ligwak_qty')::int > 0 THEN
        SELECT r INTO v_record
        FROM jsonb_array_elements(v_preview->'records') AS r
        WHERE r->>'order_id' = v_entry->>'order_id'
          AND r->>'product_id' = v_allocation->>'product_id'
          AND COALESCE(r->>'variation_id', '') = COALESCE(v_allocation->>'variation_id', '')
        LIMIT 1;

        IF v_record IS NOT NULL THEN
          INSERT INTO public.ligwak_records (
            allocation_id, entry_id, batch_id, order_id,
            order_number, ordered_at, customer_name, customer_email, customer_phone,
            product_id, product_name, variation_id, variation_name, quantity_mg,
            total_quantity, confirmed_quantity, ligwak_quantity,
            refund_amount, shipping_refunded,
            payment_type, payment_status, payment_method_name,
            refund_status, reason
          ) VALUES (
            v_allocation_id, v_entry_id, p_batch_id, (v_record->>'order_id')::uuid,
            v_record->>'order_number',
            (v_record->>'ordered_at')::timestamptz,
            v_record->>'customer_name',
            v_record->>'customer_email',
            v_record->>'customer_phone',
            v_record->>'product_id',
            v_record->>'product_name',
            v_record->>'variation_id',
            v_record->>'variation_name',
            NULLIF(v_record->>'quantity_mg', '')::numeric,
            (v_record->>'total_quantity')::int,
            (v_record->>'confirmed_quantity')::int,
            (v_record->>'ligwak_quantity')::int,
            (v_record->>'refund_amount')::numeric,
            (v_record->>'shipping_refunded')::numeric,
            v_record->>'payment_type',
            v_record->>'payment_status',
            v_record->>'payment_method_name',
            v_record->>'refund_status',
            v_record->>'reason'
          );
        END IF;
      END IF;
    END LOOP;

    UPDATE public.group_buy_kit_allocations
       SET status = 'locked', updated_at = now()
     WHERE id = v_allocation_id;

    v_locked := v_locked + 1;
  END LOOP;

  INSERT INTO public.ligwak_audit_events (batch_id, event_type, to_value, detail, actor)
  VALUES (p_batch_id, 'locked', 'locked',
          jsonb_build_object('allocations', v_locked, 'totals', v_preview->'totals'),
          auth.uid());

  RETURN v_preview;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_kit_allocation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_kit_allocation(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. recalculate_kit_allocation — the ONLY way a locked allocation moves.
--
--    Requires p_confirm, and refuses outright once money has started moving.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_kit_allocation(
  p_batch_id UUID,
  p_confirm  BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before JSONB;
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to recalculate a kit allocation.';
  END IF;

  -- Recalculating rearranges who is ligwak. That must never be a side effect of
  -- some other action; the admin has to ask for it explicitly.
  IF NOT COALESCE(p_confirm, FALSE) THEN
    RAISE EXCEPTION 'Recalculating a locked kit allocation needs explicit confirmation.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Once a refund is in flight, reshuffling would strand money against a record
  -- that no longer exists. Settle or reverse those first.
  IF EXISTS (
    SELECT 1 FROM public.ligwak_records
    WHERE batch_id = p_batch_id
      AND refund_status IN ('refund_processing', 'refunded')
  ) THEN
    RAISE EXCEPTION 'Refunds have already been processed for this batch. Recalculating would strand them.'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT jsonb_build_object(
           'allocations', COUNT(*),
           'ligwak_vials', COALESCE(SUM(ligwak_vials), 0)
         )
    INTO v_before
    FROM public.group_buy_kit_allocations
   WHERE batch_id = p_batch_id;

  -- Unlock first: the freeze trigger blocks deleting a locked ledger.
  UPDATE public.group_buy_kit_allocations
     SET status = 'draft'
   WHERE batch_id = p_batch_id;

  DELETE FROM public.group_buy_kit_allocations WHERE batch_id = p_batch_id;

  v_result := public.lock_kit_allocation(p_batch_id);

  INSERT INTO public.ligwak_audit_events (batch_id, event_type, from_value, to_value, detail, actor)
  VALUES (p_batch_id, 'recalculated',
          v_before::text, (v_result->'totals')::text,
          jsonb_build_object('before', v_before, 'after', v_result->'totals'),
          auth.uid());

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_kit_allocation(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_kit_allocation(UUID, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. set_ligwak_refund_status — move one record through the refund workflow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_ligwak_refund_status(
  p_record_id UUID,
  p_status    TEXT,
  p_notes     TEXT DEFAULT NULL
)
RETURNS public.ligwak_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from   TEXT;
  v_record public.ligwak_records%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to change a ligwak refund status.';
  END IF;

  SELECT refund_status INTO v_from FROM public.ligwak_records WHERE id = p_record_id;
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'No such ligwak record.' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.ligwak_records
     SET refund_status = p_status,
         admin_notes   = COALESCE(p_notes, admin_notes),
         updated_at    = now()
   WHERE id = p_record_id
  RETURNING * INTO v_record;

  INSERT INTO public.ligwak_audit_events (
    batch_id, allocation_id, ligwak_record_id, event_type, from_value, to_value, detail, actor
  ) VALUES (
    v_record.batch_id, v_record.allocation_id, p_record_id,
    'refund_status_changed', v_from, p_status,
    jsonb_build_object('notes', p_notes), auth.uid()
  );

  RETURN v_record;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ligwak_refund_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ligwak_refund_status(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. record_ligwak_refund — the money actually went back.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_ligwak_refund(
  p_record_id UUID,
  p_amount    NUMERIC,
  p_reference TEXT DEFAULT NULL,
  p_proof_url TEXT DEFAULT NULL,
  p_notes     TEXT DEFAULT NULL
)
RETURNS public.ligwak_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from   TEXT;
  v_record public.ligwak_records%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to record a ligwak refund.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'A recorded refund must be greater than zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT refund_status INTO v_from FROM public.ligwak_records WHERE id = p_record_id;
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'No such ligwak record.' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.ligwak_records
     SET refund_amount    = p_amount,
         refund_reference = COALESCE(p_reference, refund_reference),
         refund_proof_url = COALESCE(p_proof_url, refund_proof_url),
         admin_notes      = COALESCE(p_notes, admin_notes),
         refund_status    = 'refunded',
         refunded_at      = now(),
         updated_at       = now()
   WHERE id = p_record_id
  RETURNING * INTO v_record;

  INSERT INTO public.ligwak_audit_events (
    batch_id, allocation_id, ligwak_record_id, event_type, from_value, to_value, detail, actor
  ) VALUES (
    v_record.batch_id, v_record.allocation_id, p_record_id,
    'refund_recorded', v_from, 'refunded',
    jsonb_build_object('amount', p_amount, 'reference', p_reference, 'proof_url', p_proof_url),
    auth.uid()
  );

  RETURN v_record;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ligwak_refund(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ligwak_refund(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. mark_ligwak_notified — the customers have been told.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_ligwak_notified(p_record_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to mark ligwak customers as notified.';
  END IF;

  UPDATE public.ligwak_records
     SET customer_notified_at = now(), updated_at = now()
   WHERE id = ANY(p_record_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.ligwak_audit_events (
    batch_id, allocation_id, ligwak_record_id, event_type, to_value, detail, actor
  )
  SELECT batch_id, allocation_id, id, 'customer_notified', 'notified',
         jsonb_build_object('customer_email', customer_email), auth.uid()
  FROM public.ligwak_records
  WHERE id = ANY(p_record_ids);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_ligwak_notified(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_ligwak_notified(UUID[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. finalize_group_buy_batch — now refuses to lock totals while the kit
--    allocation is unresolved.
--
--    'finalized' already means "totals locked, supplier bulk order placed". Who
--    is ligwak is part of those totals, so finalizing without it would send the
--    supplier order out while customers owed refunds are still unidentified.
--
--    Copied forward verbatim from 20260624000000_group_buy_lifecycle.sql with
--    ONLY the allocation guard added, per the convention in this directory.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_group_buy_batch(p_id UUID)
RETURNS public.group_buy_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.group_buy_batches%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to finalize a group buy batch.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_buy_kit_allocations
    WHERE batch_id = p_id AND status = 'locked'
  ) THEN
    RAISE EXCEPTION 'Lock the kit allocation before finalizing: the ligwak customers have not been identified yet.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.group_buy_batches
     SET status = 'finalized', finalized_at = NOW()
   WHERE id = p_id AND status = 'finalizing'
  RETURNING * INTO v_batch;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Only a FINALIZING batch can be finalized.'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_group_buy_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_group_buy_batch(UUID) TO authenticated;
