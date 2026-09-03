-- ===========================================================================
-- Pure Peps — universal minimum order, with per-product overrides.
--
-- WHAT CHANGES CONCEPTUALLY
-- 20260713000000 gave every product and variation its own minimum_order_quantity,
-- resolved per LINE: a selected variation's minimum won, and each line had to
-- clear the bar by itself. That cannot express the rule the client asked for --
-- a minimum belongs to the PRODUCT and is met by the COMBINED quantity across
-- its variations, so 4 vials of 10mg + 3 of 20mg + 3 of 30mg satisfies a
-- minimum of 10. Resolution now lives in src/utils/minimumOrder.ts; this
-- migration supplies the columns and the site-wide default it reads.
--
-- WHY minimum_order_quantity IS NOT TOUCHED
-- It already exists and already holds real values on live rows. Re-adding it,
-- or re-stating its DEFAULT, would overwrite minimums an admin is relying on
-- today. The new columns describe HOW that number is chosen; the number itself
-- stays exactly where it was.
--
-- WHY THE DEFAULTS ARE WHAT THEY ARE
--   use_universal_minimum        TRUE  — the point of a universal setting is
--                                        that one change reaches every product.
--                                        FALSE would island each existing row on
--                                        its own value and make the universal
--                                        control do nothing until an admin
--                                        visited every product by hand.
--   minimum_order_enabled        TRUE  — FALSE would silently swallow the
--                                        minimums an admin later sets
--                                        universally, with the cause invisible
--                                        from the universal panel.
--   enforce_minimum_per_variation FALSE — combining is the client's stated
--                                        default; per-variation is the opt-in.
--   universal_minimum_order_enabled 'false' — applying this migration must not
--                                        start rejecting carts that were valid
--                                        a moment earlier. An admin switches it
--                                        on deliberately.
--
-- Idempotent; adds only. Drops nothing and deletes no data.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-product override columns.
-- ---------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS use_universal_minimum BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS minimum_order_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS enforce_minimum_per_variation BOOLEAN NOT NULL DEFAULT FALSE;

-- Nullable: a product that follows the universal setting has no unit of its
-- own, and NULL is what "inherit the universal unit" looks like. The CHECK
-- constrains the value to the four the admin UI offers, so a hand-written row
-- cannot produce a unit the client cannot pluralise.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS minimum_order_unit TEXT
    CHECK (minimum_order_unit IS NULL
           OR minimum_order_unit IN ('vial', 'piece', 'box', 'kit'));

-- Optional customer-facing override for the generated notice. NULL means
-- "generate it from the quantity and unit".
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS minimum_order_message TEXT;

COMMENT ON COLUMN products.use_universal_minimum IS
  'When true (default) this product follows the universal minimum in site_settings. False uses minimum_order_quantity and minimum_order_unit on this row, and that override stands even while the universal switch is off.';
COMMENT ON COLUMN products.minimum_order_enabled IS
  'False exempts this product from minimum-order rules entirely, universal or otherwise.';
COMMENT ON COLUMN products.enforce_minimum_per_variation IS
  'False (default) meets the minimum with the COMBINED quantity across all variations. True requires each variation to meet it alone.';
COMMENT ON COLUMN products.minimum_order_message IS
  'Replaces the generated "Minimum order: N units for this product." notice when set.';

-- ---------------------------------------------------------------------------
-- 2. The universal setting — three site_settings rows, no new table.
--
-- Mirrors 20260824000200_feature_visibility_flags: one row per value, read by
-- universalMinimumFromRows() which fails safe on anything it does not
-- recognise. ON CONFLICT DO NOTHING so re-running can never re-enable a
-- requirement an admin has since switched off.
-- ---------------------------------------------------------------------------
INSERT INTO site_settings (id, value, type, description) VALUES
  (
    'universal_minimum_order_enabled',
    'false',
    'boolean',
    'When true, every product that follows the universal setting requires at least universal_minimum_order_quantity. Seeded false so enabling it is always a deliberate act.'
  ),
  (
    'universal_minimum_order_quantity',
    '1',
    'number',
    'The site-wide default minimum order quantity. Only applies while universal_minimum_order_enabled is true.'
  ),
  (
    'universal_minimum_order_unit',
    'vial',
    'text',
    'Unit shown to customers with the universal minimum: vial, piece, box or kit.'
  )
ON CONFLICT (id) DO NOTHING;
