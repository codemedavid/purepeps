-- Per-product and per-variation minimum order quantity.
--
-- Generalizes the previously global, frontend-hardcoded "minimum of 2 vials per
-- product" into a configurable value the admin can set on each product and each
-- size variation. Existing rows backfill to 2 via the column default, preserving
-- current behavior. A variation's minimum overrides its product's minimum when a
-- variation is selected (resolution happens client-side in resolveMinOrder()).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS minimum_order_quantity INTEGER NOT NULL DEFAULT 2
    CHECK (minimum_order_quantity >= 1);

ALTER TABLE product_variations
  ADD COLUMN IF NOT EXISTS minimum_order_quantity INTEGER NOT NULL DEFAULT 2
    CHECK (minimum_order_quantity >= 1);
