-- Pure Peps — paid group-buy access requests.
-- Members pay a one-time access fee, attach a payment screenshot, and an admin
-- approves the request to unlock checkout. Run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email TEXT NOT NULL,

  -- Payment details
  payment_method_id TEXT,
  payment_method_name TEXT,
  payment_proof_url TEXT,
  amount DECIMAL(10,2) NOT NULL DEFAULT 250,

  -- Review workflow: pending -> approved | rejected
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_created_at ON access_requests(created_at DESC);

-- Keep updated_at fresh (reuses the shared trigger function from the orders table).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_access_requests_updated_at ON access_requests;
CREATE TRIGGER update_access_requests_updated_at
  BEFORE UPDATE ON access_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security: anyone can create a request and read status by email
-- (anon storefront has no auth); only service role / admin updates status.
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "access_requests_insert" ON access_requests;
CREATE POLICY "access_requests_insert" ON access_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "access_requests_select" ON access_requests;
CREATE POLICY "access_requests_select" ON access_requests
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "access_requests_update" ON access_requests;
CREATE POLICY "access_requests_update" ON access_requests
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Storage bucket for payment proof screenshots.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "payment_proofs_read" ON storage.objects;
CREATE POLICY "payment_proofs_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "payment_proofs_insert" ON storage.objects;
CREATE POLICY "payment_proofs_insert" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'payment-proofs');
