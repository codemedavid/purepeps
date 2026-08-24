import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260826000000_customer_reviews.sql'),
  'utf8',
);

/** Body of one CREATE FUNCTION block, so assertions cannot drift across functions. */
function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}`);
  expect(start, `${name} should be defined`).toBeGreaterThan(-1);
  const end = sql.indexOf('$$;', start);
  expect(end, `${name} should be terminated`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

/** The RETURNS TABLE (...) signature of one function. */
function returnsSignature(name: string): string {
  const body = functionBody(name);
  const start = body.indexOf('RETURNS TABLE');
  expect(start, `${name} should return a table`).toBeGreaterThan(-1);
  return body.slice(start, body.indexOf(')', start) + 1);
}

const PII_COLUMNS = ['reviewer_name', 'reviewer_email', 'reviewer_phone'];

describe('product_reviews table', () => {
  it('links every review to the order and product that justify it', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.product_reviews');
    expect(sql).toContain('REFERENCES public.orders(id) ON DELETE CASCADE');
    expect(sql).toMatch(/order_number\s+TEXT/);
    expect(sql).toMatch(/product_id\s+TEXT\s+NOT NULL/);
    expect(sql).toMatch(/product_name\s+TEXT\s+NOT NULL/);
  });

  it('stores reviewer identity for admin verification only', () => {
    for (const column of PII_COLUMNS) {
      expect(sql).toContain(column);
    }
    expect(sql).toMatch(/display_name\s+TEXT\s+NOT NULL/);
  });

  it('constrains rating to whole stars 1-5 in the database, not just the client', () => {
    expect(sql).toMatch(/rating\s+SMALLINT\s+NOT NULL[\s\S]*?CHECK \(rating BETWEEN 1 AND 5\)/);
  });

  it('defaults every review to pending and allows only the four known states', () => {
    expect(sql).toMatch(/status\s+TEXT\s+NOT NULL\s+DEFAULT 'pending'/);
    expect(sql).toContain("CHECK (status IN ('pending','approved','rejected','hidden'))");
  });

  it('allows one review per purchased product so an order cannot be farmed', () => {
    expect(sql).toContain('UNIQUE (order_id, product_id)');
  });
});

describe('row level security', () => {
  it('enables RLS and clears legacy policies before re-policing', () => {
    expect(sql).toContain('ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("_drop_all_policies('public.product_reviews'::regclass)");
  });

  it('gives anon no direct access to the table at all', () => {
    expect(sql).toContain('REVOKE ALL ON public.product_reviews FROM anon');
    expect(sql).not.toMatch(
      /GRANT\s+(SELECT|INSERT|UPDATE|DELETE)[^;]*ON public\.product_reviews TO [^;]*anon/,
    );
  });

  it('restricts every direct read and write to admins', () => {
    expect(sql).toContain('USING (public.is_admin()) WITH CHECK (public.is_admin())');
  });

  it('indexes the lookups the public page and admin queue actually run', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS \S+\s+ON public\.product_reviews \(product_id, status\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS \S+\s+ON public\.product_reviews \(status, created_at DESC\)/,
    );
  });
});

describe('get_reviewable_order', () => {
  const body = () => functionBody('get_reviewable_order');

  it('runs as SECURITY DEFINER with a pinned search_path', () => {
    expect(body()).toContain('SECURITY DEFINER');
    expect(body()).toContain('SET search_path = public');
  });

  it('requires the order number AND the email to match the same order', () => {
    expect(body()).toContain('lower(btrim(');
    expect(body()).toMatch(/lower\(btrim\(o\.order_number\)\) = v_order_number/);
    expect(body()).toMatch(/lower\(btrim\(o\.customer_email\)\) = v_email/);
  });

  it('only unlocks orders that were actually delivered', () => {
    expect(body()).toContain("order_status = 'delivered'");
  });

  it('expands the order items so only purchased products come back', () => {
    expect(body()).toContain('jsonb_array_elements');
  });

  it('never returns customer PII to the caller', () => {
    const signature = returnsSignature('get_reviewable_order');
    for (const column of [...PII_COLUMNS, 'customer_name', 'customer_email', 'customer_phone']) {
      expect(signature).not.toContain(column);
    }
  });

  it('is executable by anonymous visitors but not by PUBLIC at large', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_reviewable_order');
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_reviewable_order[^;]*TO anon/);
  });
});

describe('submit_product_review', () => {
  const body = () => functionBody('submit_product_review');

  it('re-verifies the order number and email itself instead of trusting an order id', () => {
    expect(body()).toMatch(/lower\(btrim\(o\.order_number\)\) = v_order_number/);
    expect(body()).toMatch(/lower\(btrim\(o\.customer_email\)\) = v_email/);
    // A client-supplied order id would let a caller skip verification entirely.
    expect(body()).not.toMatch(/p_order_id/);
  });

  it('still requires the order to be delivered', () => {
    expect(body()).toContain("order_status = 'delivered'");
  });

  it('refuses a product that was not in that order', () => {
    expect(body()).toMatch(/RAISE EXCEPTION[^;]*not part of|not_in_order|NOT FOUND/i);
    expect(body()).toContain('jsonb_array_elements');
  });

  it('snapshots reviewer identity from the order row, never from parameters', () => {
    expect(body()).toMatch(/v_order\.customer_name/);
    expect(body()).toMatch(/v_order\.customer_email/);
    expect(body()).toMatch(/v_order\.customer_phone/);
    expect(body()).not.toMatch(/p_reviewer_name|p_customer_name|p_reviewer_email/);
  });

  it('hard-codes pending status so no submission can be born approved', () => {
    expect(body()).toContain("'pending'");
    expect(body()).not.toMatch(/p_status/);
  });

  it('validates the rating server-side', () => {
    expect(body()).toMatch(/p_rating[^;]*BETWEEN 1 AND 5|p_rating < 1 OR p_rating > 5/);
  });

  it('drops attached media when the admin has media switched off', () => {
    expect(body()).toContain('feature_review_media_enabled');
  });

  it('is executable by anonymous visitors', () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_product_review[^;]*TO anon/);
  });
});

describe('get_approved_reviews', () => {
  it('returns only approved reviews', () => {
    expect(functionBody('get_approved_reviews')).toContain("status = 'approved'");
  });

  it('exposes no PII column in its signature — the signature IS the boundary', () => {
    const signature = returnsSignature('get_approved_reviews');
    for (const column of [...PII_COLUMNS, 'order_id', 'order_number', 'moderated_by', 'status']) {
      expect(signature).not.toContain(column);
    }
  });

  it('exposes exactly the fields the public page renders', () => {
    const signature = returnsSignature('get_approved_reviews');
    for (const column of [
      'display_name',
      'rating',
      'body',
      'product_id',
      'product_name',
      'media_urls',
      'admin_reply',
      'created_at',
    ]) {
      expect(signature).toContain(column);
    }
  });

  it('bounds the result set instead of returning every review ever written', () => {
    expect(functionBody('get_approved_reviews')).toMatch(/LIMIT/);
  });

  it('is readable by anonymous visitors', () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_approved_reviews[^;]*TO anon/);
  });
});

describe('migration hygiene', () => {
  it('is re-runnable without dropping the reviews table', () => {
    expect(sql).not.toMatch(/DROP\s+TABLE\s+(IF EXISTS\s+)?public\.product_reviews/i);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
  });

  it('never deletes order rows', () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.orders/i);
  });
});

describe('review feature flags migration', () => {
  const flagSql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260826000100_review_feature_flags.sql'),
    'utf8',
  );

  it('seeds a page switch and a separate media switch', () => {
    expect(flagSql).toContain('feature_reviews_enabled');
    expect(flagSql).toContain('feature_review_media_enabled');
  });

  it('never clobbers a choice the admin has already made', () => {
    expect(flagSql).toContain('ON CONFLICT (id) DO NOTHING');
  });
});
