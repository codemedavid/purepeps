-- Checkout sticker add-on
--
-- Customers can optionally pick a free sticker design to include in their
-- package, and the design list is admin-managed (mirrors couriers /
-- payment_methods). We also record the customer's chosen sticker on the order.
--
-- Note: the optional FB-link / WhatsApp contact field reuses the existing
-- orders.contact_method column (added in 20250117000000_ensure_orders_table.sql),
-- so no new contact column is needed here.

-- 1. Sticker catalog ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS stickers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;

-- Role grants (this table is created after the data-plane lockdown migration,
-- which only granted the tables that existed then). Anon reads the catalog at
-- checkout; admins manage it.
GRANT SELECT ON stickers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON stickers TO authenticated;

-- Public can read the catalog (storefront checkout offers active designs).
DROP POLICY IF EXISTS "Allow public read access to stickers" ON stickers;
CREATE POLICY "Allow public read access to stickers"
  ON stickers FOR SELECT
  USING (true);

-- Only authenticated admins can manage the catalog.
DROP POLICY IF EXISTS "Allow authenticated users to manage stickers" ON stickers;
CREATE POLICY "Allow authenticated users to manage stickers"
  ON stickers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Order columns -----------------------------------------------------------
-- The chosen sticker is denormalized onto the order: the id links back to the
-- catalog, and the name is captured at order time so it survives later catalog
-- edits/deletions (same approach as payment_method_name on orders).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'selected_sticker_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN selected_sticker_id UUID REFERENCES stickers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'selected_sticker_name'
  ) THEN
    ALTER TABLE orders ADD COLUMN selected_sticker_name TEXT;
  END IF;
END $$;
