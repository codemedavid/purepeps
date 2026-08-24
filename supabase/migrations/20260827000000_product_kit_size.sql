-- Pure Peps — per-product and per-variation kit size.
--
-- "How many vials make one complete kit" has been a single hard-coded 10 in the
-- frontend (VIALS_PER_KIT in groupBuyOverview.ts). The Ligwak feature turns that
-- number into the thing the whole allocation hinges on, so it has to be a real
-- per-product setting: suppliers pack different peptides in different kit sizes.
--
-- Mirrors 20260713000000_add_minimum_order_quantity.sql, with ONE deliberate
-- difference: these columns are NULLABLE with no default.
--
-- minimum_order_quantity could take NOT NULL DEFAULT 2 because every product
-- genuinely has a minimum. A kit size does not: leaving it unset must mean
-- "inherit" — a variation falls through to its product, and a product falls
-- through to DEFAULT_VIALS_PER_KIT. Stamping every row with a concrete default
-- would erase that distinction and silently freeze today's 10 onto products
-- whose real kit size nobody has entered yet.
--
-- Resolution happens client-side in resolveKitSize(); the allocator snapshots
-- the resolved number onto the allocation, so editing a product later can never
-- retroactively change a locked kit allocation.
--
-- Idempotent; safe to re-run.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS vials_per_kit INTEGER
    CHECK (vials_per_kit >= 1);

ALTER TABLE product_variations
  ADD COLUMN IF NOT EXISTS vials_per_kit INTEGER
    CHECK (vials_per_kit >= 1);

COMMENT ON COLUMN products.vials_per_kit IS
  'Vials in one complete kit for this product. NULL means inherit DEFAULT_VIALS_PER_KIT (10).';

COMMENT ON COLUMN product_variations.vials_per_kit IS
  'Vials in one complete kit for this variation. NULL means inherit the parent product''s kit size.';
