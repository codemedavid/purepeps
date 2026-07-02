-- Relate shipping locations to a courier so checkout can filter rates per courier.
-- Previously the checkout matched rates by fuzzy string comparison of the courier
-- `code` against the location name/id, which failed (e.g. code "jnt" never matches
-- name "J&T ..."). A proper foreign key makes the relationship explicit.

ALTER TABLE shipping_locations
  ADD COLUMN IF NOT EXISTS courier_id uuid REFERENCES couriers(id) ON DELETE CASCADE;

-- Backfill: existing shipping locations belong to J&T Express (the only courier).
UPDATE shipping_locations sl
SET courier_id = c.id
FROM couriers c
WHERE sl.courier_id IS NULL
  AND c.code = 'jnt';

CREATE INDEX IF NOT EXISTS idx_shipping_locations_courier_id
  ON shipping_locations (courier_id);
