-- One-off cleanup of orders corrupted by the order-item draft-bleed bug (now
-- fixed in code: OrderItemsEditor resets its draft per order, so a save can no
-- longer write the wrong order's items or spawn duplicate linked orders).
--
-- Three bogus rows remained under customer reference TBS-100062-8683
-- (root f3f9b821-8761-459d-b235-1a2370ab829f), none referenced as a parent:
--   * TBS-100150-6735 — emptied to 0 items / P0.00 by a stale-draft save
--   * TBS-100159-2741 — duplicate linked order from the stale draft (cancelled)
--   * TBS-100161-8041 — second duplicate linked order (cancelled)
--
-- Each delete is guarded by the exact corrupted signature, so the migration is
-- idempotent and cannot remove a legitimately reused order number later.

-- The emptied order: no line items and a zero total.
DELETE FROM public.orders
WHERE order_number = 'TBS-100150-6735'
  AND jsonb_array_length(coalesce(order_items, '[]'::jsonb)) = 0
  AND coalesce(total_price, 0) = 0;

-- The two duplicate add-on orders the bug spawned, already cancelled by the admin.
DELETE FROM public.orders
WHERE order_number IN ('TBS-100159-2741', 'TBS-100161-8041')
  AND order_status = 'cancelled';
