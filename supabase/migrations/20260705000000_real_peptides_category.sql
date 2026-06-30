-- Promote the client-only "All Peptides" pseudo-category into a real one.
--
-- Background: useCategories.ts synthesizes a pseudo-category { id: 'all' } purely
-- so the storefront can offer a "show everything" filter. New products were
-- defaulting to that pseudo id, so 95 products ended up with category = 'all' —
-- an id that matches no real categories row. Those products landed in the
-- trailing "Other" catalog section and could not be granted access by category
-- in the tier manager (which filters the 'all' pseudo-category out).
--
-- Fix: create a real "Peptides" category and move every 'all' product onto it.
-- The 'all' pseudo-category stays as the storefront's show-everything filter.

-- 1. Create the real "Peptides" category, slotted second.
INSERT INTO categories (id, name, icon, sort_order, active)
VALUES ('c0a80121-0009-4e78-94f8-585d77059009', 'Peptides', 'FlaskConical', 2, true)
ON CONFLICT (id) DO NOTHING;

-- 2. Make room at sort_order 2 for the new category (shift the other active ones
--    down so ordering stays stable; inactive categories are untouched).
UPDATE categories
SET sort_order = sort_order + 1
WHERE active = true
  AND id <> 'c0a80121-0009-4e78-94f8-585d77059009'
  AND sort_order >= 2;

-- 3. Migrate the orphaned products onto the real category.
UPDATE products
SET category = 'c0a80121-0009-4e78-94f8-585d77059009'
WHERE category = 'all';
