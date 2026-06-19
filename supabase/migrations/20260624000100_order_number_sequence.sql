-- Pure Peps — collision-free order numbers.
--
-- Order numbers were generated client-side as `TBS-${random 1000..9999}`
-- (Checkout.tsx), which collides as volume grows AND is the key the public
-- tracking RPC and the new leftover-claim flow look orders up by. This replaces
-- the random scheme with a monotonic sequence behind a SECURITY DEFINER RPC the
-- storefront calls before insert, plus a UNIQUE backstop.
--
-- The sequence starts at 100000 so every generated number is >= 6 digits and can
-- never collide with the historical 4-digit random numbers. Idempotent.

-- ===========================================================================
-- 1. Monotonic sequence + generator RPC.
-- ===========================================================================
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 100000 INCREMENT BY 1;

-- Park the sequence above any existing numeric suffix (defensive; historical
-- numbers are 4-digit so this normally resolves to 100000).
SELECT setval(
  'public.order_number_seq',
  GREATEST(
    100000,
    COALESCE(
      (SELECT MAX((regexp_replace(order_number, '\D', '', 'g'))::bigint)
         FROM public.orders
        WHERE order_number ~ '^TBS-[0-9]+$'),
      0
    ) + 1
  ),
  false  -- next nextval() returns exactly this value
);

CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'TBS-' || nextval('public.order_number_seq')::text;
$$;

REVOKE ALL ON FUNCTION public.next_order_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_order_number() TO anon, authenticated;

-- ===========================================================================
-- 2. Backfill + uniqueness backstop.
-- ===========================================================================
UPDATE public.orders
   SET order_number = public.next_order_number()
 WHERE order_number IS NULL OR btrim(order_number) = '';

-- Renumber any pre-existing duplicates (keep the earliest row's number).
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY order_number ORDER BY created_at, id) AS rn
  FROM public.orders
  WHERE order_number IS NOT NULL
)
UPDATE public.orders o
   SET order_number = public.next_order_number()
  FROM ranked r
 WHERE o.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_key
  ON public.orders (order_number)
  WHERE order_number IS NOT NULL;
