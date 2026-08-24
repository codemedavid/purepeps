import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260827000100_ligwak_allocation.sql'),
  'utf8',
);
const rpcs = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260827000200_ligwak_rpcs.sql'),
  'utf8',
);

/** Body of one CREATE FUNCTION block, so assertions cannot drift across functions. */
function functionBody(name: string): string {
  const start = rpcs.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} should be defined`).toBeGreaterThan(-1);
  const end = rpcs.indexOf('$$;', start);
  expect(end, `${name} should be terminated`).toBeGreaterThan(start);
  return rpcs.slice(start, end);
}

const TABLES = [
  'group_buy_kit_allocations',
  'group_buy_kit_allocation_entries',
  'ligwak_records',
  'ligwak_audit_events',
];

describe('ligwak schema', () => {
  it('creates the allocation, ledger, record and audit tables', () => {
    for (const table of TABLES) {
      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
  });

  it('ties every allocation to its batch and cleans up with it', () => {
    expect(schema).toContain('REFERENCES public.group_buy_batches(id) ON DELETE CASCADE');
    expect(schema).toContain('REFERENCES public.orders(id) ON DELETE CASCADE');
  });

  // The kit size is snapshotted so editing a product later cannot retroactively
  // change an allocation that has already been locked and refunded against.
  it('snapshots the kit size onto the allocation', () => {
    expect(schema).toMatch(/kit_size\s+INTEGER\s+NOT NULL[\s\S]*?CHECK \(kit_size >= 1\)/);
  });

  it('allows only one live allocation per product variation in a batch', () => {
    expect(schema).toMatch(/CREATE UNIQUE INDEX[\s\S]*?group_buy_kit_allocations/);
    expect(schema).toContain("COALESCE(variation_id, '')");
  });

  it('locks an allocation through an explicit two-state machine', () => {
    expect(schema).toMatch(/status\s+TEXT\s+NOT NULL\s+DEFAULT 'draft'/);
    expect(schema).toContain("CHECK (status IN ('draft','locked'))");
    expect(schema).toContain('locked_at');
    expect(schema).toContain('locked_by');
  });

  it('keeps every ledger entry internally consistent', () => {
    expect(schema).toContain('CHECK (quantity = confirmed_qty + ligwak_qty)');
  });

  it('records at least one ligwak vial on every ligwak record', () => {
    expect(schema).toMatch(/CHECK \(ligwak_quantity >= 1\)/);
  });

  it('defaults a new ligwak record to the review queue and allows only known statuses', () => {
    expect(schema).toMatch(/refund_status\s+TEXT\s+NOT NULL\s+DEFAULT 'for_review'/);
    for (const status of [
      'for_review',
      'refund_pending',
      'refund_processing',
      'refunded',
      'refund_failed',
      'no_refund_required',
    ]) {
      expect(schema).toContain(`'${status}'`);
    }
  });

  it('snapshots the customer and product onto the record', () => {
    for (const column of [
      'customer_name',
      'customer_email',
      'customer_phone',
      'order_number',
      'product_name',
      'variation_name',
      'quantity_mg',
    ]) {
      expect(schema).toContain(column);
    }
  });

  it('carries the refund evidence fields the admin workflow needs', () => {
    for (const column of ['refund_reference', 'refund_proof_url', 'admin_notes', 'refunded_at']) {
      expect(schema).toContain(column);
    }
  });

  it('never lets a customer be marked ligwak twice for the same allocation', () => {
    expect(schema).toContain('UNIQUE (allocation_id, order_id)');
  });
});

describe('ligwak row level security', () => {
  it('enables RLS on every ligwak table', () => {
    for (const table of TABLES) {
      expect(schema).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  // These rows name customers, their contact details and what they are owed.
  // anon must not hold a grant at all, so there is no policy to get wrong.
  it('gives anon no grant on any ligwak table', () => {
    for (const table of TABLES) {
      expect(schema).toContain(`REVOKE ALL ON public.${table} FROM anon`);
    }
  });

  it('clears legacy policies before re-policing, so none can OR-in a public read', () => {
    for (const table of TABLES) {
      expect(schema).toContain(`public._drop_all_policies('public.${table}'::regclass)`);
    }
  });

  it('restricts every table to admins', () => {
    expect(schema.match(/USING \(public\.is_admin\(\)\) WITH CHECK \(public\.is_admin\(\)\)/g))
      .toHaveLength(TABLES.length);
  });
});

const GUARDED_RPCS = [
  'preview_kit_allocation',
  'lock_kit_allocation',
  'recalculate_kit_allocation',
  'set_ligwak_refund_status',
  'record_ligwak_refund',
  'mark_ligwak_notified',
];

describe('ligwak RPCs', () => {
  it('defines every RPC the admin workflow calls', () => {
    for (const name of GUARDED_RPCS) {
      expect(rpcs).toContain(`CREATE OR REPLACE FUNCTION public.${name}`);
    }
  });

  it('guards every RPC with an explicit admin check', () => {
    for (const name of GUARDED_RPCS) {
      expect(functionBody(name), `${name} must check is_admin`).toContain('public.is_admin()');
    }
  });

  it('keeps every RPC out of anon hands', () => {
    for (const name of GUARDED_RPCS) {
      expect(rpcs).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}`));
      expect(rpcs).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}[^;]*TO authenticated`));
    }
  });

  // Checked per function body rather than by counting occurrences, so a passing
  // mention of the phrase in a comment cannot stand in for a real declaration.
  it('runs every RPC as definer with a pinned search_path', () => {
    for (const name of [...GUARDED_RPCS, 'finalize_group_buy_batch']) {
      const body = functionBody(name);
      expect(body, `${name} must be SECURITY DEFINER`).toContain('SECURITY DEFINER');
      expect(body, `${name} must pin search_path`).toContain('SET search_path = public');
    }
  });
});

describe('allocation ordering is the database s job, not the client s', () => {
  it('allocates strictly by placement time with a deterministic tie-break', () => {
    const body = functionBody('preview_kit_allocation');
    // Equal timestamps must never let a recalculation swap who is ligwak.
    expect(body).toMatch(/ORDER BY[\s\S]{0,80}created_at[\s\S]{0,80}order_number[\s\S]{0,40}id/);
  });

  it('mirrors the confirmed-order predicate the caps already use', () => {
    const body = functionBody('preview_kit_allocation');
    expect(body).toContain("o.order_status NOT IN ('cancelled', 'new')");
    expect(body).toContain('o.manually_confirmed_at IS NOT NULL');
    expect(body).toContain("o.payment_type = 'cod'");
    expect(body).toContain("o.payment_status = 'paid'");
    // The branch the TS mirror had lost — an already-paid order under review.
    expect(body).toMatch(/payment_status = 'submitted'[\s\S]{0,60}paid_total IS NOT NULL/);
  });

  it('reads without writing, so a preview can never change the data', () => {
    const body = functionBody('preview_kit_allocation');
    expect(body).toContain('STABLE');
    expect(body).not.toMatch(/\bINSERT INTO\b|\bUPDATE public\.|\bDELETE FROM\b/);
  });
});

describe('the money rules live in the database, not only the client', () => {
  // paid_total belongs to the ORDER. Capping each ligwak line against the same
  // undecremented figure lets two lines of one order refund more than it paid.
  it('shares one refund ceiling across an order s ligwak lines', () => {
    const body = functionBody('preview_kit_allocation');
    // A running total over the order's own lines is the only way to know what
    // is left; a bare paid_total - refunded_total cannot.
    expect(body).toMatch(/OVER\s*\([^)]*PARTITION BY[^)]*order_id/);
    expect(body).toMatch(/headroom/);
  });

  it('caps a recorded refund at the amount that was calculated', () => {
    const body = functionBody('record_ligwak_refund');
    // The client already checks this, but a retried request or any other caller
    // bypasses the client entirely.
    expect(body).toMatch(/refund_amount/);
    expect(body).toMatch(/exceed/i);
  });

  it('refuses to record a refund twice over the same record', () => {
    const body = functionBody('record_ligwak_refund');
    expect(body).toMatch(/'refunded'/);
    expect(body).toMatch(/already/i);
  });
});

describe('locking is one-way and audited', () => {
  it('refuses to lock an allocation that is already locked', () => {
    expect(functionBody('lock_kit_allocation')).toMatch(/status = 'draft'|already locked/i);
  });

  it('requires explicit confirmation before rearranging a locked allocation', () => {
    const body = functionBody('recalculate_kit_allocation');
    expect(body).toMatch(/p_confirm/);
    expect(body).toMatch(/RAISE EXCEPTION/);
  });

  it('writes an audit row for every consequential action', () => {
    for (const name of [
      'lock_kit_allocation',
      'recalculate_kit_allocation',
      'set_ligwak_refund_status',
      'record_ligwak_refund',
      'mark_ligwak_notified',
    ]) {
      expect(functionBody(name), `${name} must audit`).toContain(
        'INSERT INTO public.ligwak_audit_events',
      );
    }
  });

  // An append-only trail that cascade-deletes is not a trail. Recalculating
  // must not erase the record of what was decided and paid before it.
  it('keeps the audit trail when a ligwak record is deleted', () => {
    expect(schema).toMatch(
      /ligwak_record_id[\s\S]{0,120}REFERENCES public\.ligwak_records\(id\) ON DELETE SET NULL/,
    );
  });

  it('refuses to recalculate over refund work that would be destroyed', () => {
    const body = functionBody('recalculate_kit_allocation');
    // Not just money already sent: a reference number, an uploaded proof, notes
    // or a customer already told a refund is coming would all vanish with the
    // cascaded rows.
    expect(body).toContain('customer_notified_at');
    expect(body).toContain('refund_reference');
    expect(body).toContain('refund_proof_url');
    // refund_failed means money is STILL OWED — the most dangerous row to drop.
    expect(body).toMatch(/refund_failed/);
  });

  it('blocks finalizing a batch whose kit allocation was never locked', () => {
    const body = functionBody('finalize_group_buy_batch');
    expect(body).toContain('group_buy_kit_allocations');
    expect(body).toMatch(/RAISE EXCEPTION/);
  });
});
