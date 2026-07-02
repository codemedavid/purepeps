-- Add the sort_order column the app depends on.
--
-- The live `couriers` table was created from an early schema that never
-- included `sort_order`, but the client (Courier interface, Add Courier form,
-- and the fetch `.order('sort_order')`) all reference it. Inserts from the
-- admin panel therefore failed with "Failed to save courier" because PostgREST
-- could not find the column. This backfills the column so writes succeed.
--
-- Idempotent: safe to re-run.
ALTER TABLE couriers
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill deterministic ordering for existing rows that all default to 0,
-- preserving creation order so the dropdown stays stable.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, name) AS rn
  FROM couriers
)
UPDATE couriers c
SET sort_order = ordered.rn
FROM ordered
WHERE c.id = ordered.id
  AND c.sort_order = 0;
