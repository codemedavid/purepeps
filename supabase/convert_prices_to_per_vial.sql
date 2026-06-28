-- ============================================================
-- Convert peptide prices from PER-KIT to PER-VIAL (Per Piece)
-- ============================================================
-- Context: The site currently prices products per KIT.
--          1 kit = 10 vials, so Per Vial (Per Piece) = Per Kit / 10.
--          This matches the "Per Piece (PHP)" column of the Batch 3 pricelist.
--
-- Affected money columns:
--   products.base_price
--   products.discount_price
--   product_variations.price                  (complete-set / vial price)
--   product_variations.disposable_pen_price
--   product_variations.reusable_pen_price
--
-- HOW TO RUN (Supabase SQL editor):
--   STEP 1  -> run the BACKUP block once.
--   STEP 2  -> run the PREVIEW block, sanity-check current vs proposed.
--   STEP 3  -> run the CONVERT block (the actual UPDATEs).
--   STEP 4  -> run the VERIFY block.
--   ROLLBACK (optional) -> run the ROLLBACK block to restore originals.
--
-- IMPORTANT: Run the CONVERT block EXACTLY ONCE. Running it twice
--            divides prices by 100. The backup tables let you recover.
-- ============================================================


-- ============================================================
-- STEP 1 — BACKUP (run once)
-- ============================================================
CREATE TABLE IF NOT EXISTS products_price_backup_per_vial AS
  SELECT id, base_price, discount_price, NOW() AS backed_up_at
  FROM products;

CREATE TABLE IF NOT EXISTS product_variations_price_backup_per_vial AS
  SELECT id, price, disposable_pen_price, reusable_pen_price, NOW() AS backed_up_at
  FROM product_variations;


-- ============================================================
-- STEP 2 — PREVIEW (read-only, current vs proposed)
-- ============================================================
SELECT
  name,
  base_price                         AS current_kit,
  ROUND(base_price / 10.0, 2)        AS proposed_vial,
  discount_price                     AS current_kit_discount,
  ROUND(discount_price / 10.0, 2)    AS proposed_vial_discount
FROM products
ORDER BY name;

SELECT
  v.name,
  v.price                              AS current_kit,
  ROUND(v.price / 10.0, 2)             AS proposed_vial,
  v.disposable_pen_price               AS current_kit_disp_pen,
  ROUND(v.disposable_pen_price/10.0,2) AS proposed_vial_disp_pen,
  v.reusable_pen_price                 AS current_kit_reuse_pen,
  ROUND(v.reusable_pen_price/10.0,2)   AS proposed_vial_reuse_pen
FROM product_variations v
ORDER BY v.name;


-- ============================================================
-- STEP 3 — CONVERT (run EXACTLY ONCE)
-- ============================================================
UPDATE products
SET base_price     = ROUND(base_price / 10.0, 2),
    discount_price = ROUND(discount_price / 10.0, 2),
    updated_at     = NOW()
WHERE base_price IS NOT NULL;

UPDATE product_variations
SET price                = ROUND(price / 10.0, 2),
    disposable_pen_price = ROUND(disposable_pen_price / 10.0, 2),
    reusable_pen_price   = ROUND(reusable_pen_price / 10.0, 2);


-- ============================================================
-- STEP 4 — VERIFY
-- ============================================================
SELECT p.name, b.base_price AS old_kit, p.base_price AS new_vial,
       ROUND(b.base_price / p.base_price, 2) AS ratio_should_be_10
FROM products p
JOIN products_price_backup_per_vial b ON b.id = p.id
ORDER BY p.name;


-- ============================================================
-- ROLLBACK (optional) — restore original per-kit prices
-- ============================================================
-- UPDATE products p
-- SET base_price     = b.base_price,
--     discount_price = b.discount_price,
--     updated_at     = NOW()
-- FROM products_price_backup_per_vial b
-- WHERE b.id = p.id;
--
-- UPDATE product_variations v
-- SET price                = b.price,
--     disposable_pen_price = b.disposable_pen_price,
--     reusable_pen_price   = b.reusable_pen_price
-- FROM product_variations_price_backup_per_vial b
-- WHERE b.id = v.id;
