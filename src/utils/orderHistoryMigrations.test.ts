import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const events = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260825000000_order_status_events.sql'),
  'utf8',
);

const rpcs = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260825000100_order_history_rpcs.sql'),
  'utf8',
);

describe('order status events migration', () => {
  it('creates the per-order and per-batch event tables', () => {
    expect(events).toContain('CREATE TABLE IF NOT EXISTS public.order_status_events');
    expect(events).toContain('CREATE TABLE IF NOT EXISTS public.group_buy_stage_events');
  });

  it('indexes each event table by its owner and time so a timeline reads in order', () => {
    expect(events).toContain('order_status_events_order_id_occurred_at_idx');
    expect(events).toContain('group_buy_stage_events_batch_id_occurred_at_idx');
  });

  it('records a placed event for every new order', () => {
    expect(events).toContain('AFTER INSERT ON public.orders');
    expect(events).toMatch(/'placed'/);
  });

  it('records an event only when a status actually changes', () => {
    expect(events).toContain('AFTER UPDATE ON public.orders');
    expect(events).toContain('NEW.order_status IS DISTINCT FROM OLD.order_status');
    expect(events).toContain('NEW.payment_status IS DISTINCT FROM OLD.payment_status');
  });

  it('records batch stage changes once per batch, never once per order', () => {
    expect(events).toContain('AFTER UPDATE ON public.group_buy_batches');
    expect(events).toContain('NEW.fulfillment_stage IS DISTINCT FROM OLD.fulfillment_stage');
    // Write amplification guard: the batch trigger must not fan out into orders.
    expect(events).not.toMatch(/INSERT INTO public\.order_status_events[\s\S]{0,400}FROM public\.orders/);
  });

  it('backfills only a placed event for pre-existing orders', () => {
    expect(events).toContain('INSERT INTO public.order_status_events');
    expect(events).toContain('o.created_at');
    expect(events).toContain('ON CONFLICT DO NOTHING');
  });

  it('keeps both event tables unreadable by the anon role', () => {
    expect(events).toContain('ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY');
    expect(events).toContain('ALTER TABLE public.group_buy_stage_events ENABLE ROW LEVEL SECURITY');
    expect(events).not.toMatch(/GRANT SELECT ON public\.order_status_events TO anon/);
    expect(events).not.toMatch(/GRANT SELECT ON public\.group_buy_stage_events TO anon/);
  });
});

describe('order history RPC migration', () => {
  it('exposes both lookups as SECURITY DEFINER functions', () => {
    expect(rpcs).toContain('CREATE FUNCTION public.get_order_history_by_email(');
    expect(rpcs).toContain('CREATE FUNCTION public.get_order_history_by_number(');
    expect((rpcs.match(/SECURITY DEFINER/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((rpcs.match(/SET search_path = public/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('requires an email alongside the order number before returning personal data', () => {
    // Order numbers come from a monotonic sequence, so they are enumerable. The
    // email is the second factor that stops a sweep from harvesting addresses.
    expect(rpcs).toContain('get_order_history_by_number(p_order_number TEXT, p_email TEXT)');
    expect(rpcs).toMatch(/lower\(btrim\(coalesce\(p_email, ''\)\)\)/);
  });

  it('returns the customer and checkout detail the history page renders', () => {
    for (const column of [
      'customer_name',
      'customer_email',
      'customer_phone',
      'contact_method',
      'shipping_address',
      'shipping_barangay',
      'shipping_city',
      'shipping_state',
      'shipping_zip_code',
      'shipping_location',
      'selected_sticker_name',
      'notes',
    ]) {
      expect(rpcs).toContain(column);
    }
  });

  it('joins the group buy so an order names its batch', () => {
    expect(rpcs).toContain('batch_name');
    expect(rpcs).toContain('batch_number');
    expect(rpcs).toContain('public.group_buy_batches');
  });

  it('recovers each line item milligram strength from the variation table', () => {
    expect(rpcs).toContain('public.product_variations');
    expect(rpcs).toContain('quantity_mg');
  });

  it('returns the merged status events as part of each order', () => {
    expect(rpcs).toContain('status_events');
    expect(rpcs).toContain('public.order_status_events');
    expect(rpcs).toContain('public.group_buy_stage_events');
  });

  it('never leaks admin-only fields to the storefront', () => {
    expect(rpcs).not.toContain('admin_notes');
    expect(rpcs).not.toContain('manually_confirmed_by');
  });

  it('grants execute to the storefront roles only after revoking public access', () => {
    expect(rpcs).toContain('REVOKE ALL ON FUNCTION public.get_order_history_by_email(TEXT) FROM PUBLIC');
    expect(rpcs).toContain('GRANT EXECUTE ON FUNCTION public.get_order_history_by_email(TEXT) TO anon, authenticated');
    expect(rpcs).toContain('REVOKE ALL ON FUNCTION public.get_order_history_by_number(TEXT, TEXT) FROM PUBLIC');
    expect(rpcs).toContain('GRANT EXECUTE ON FUNCTION public.get_order_history_by_number(TEXT, TEXT) TO anon, authenticated');
  });

  it('is safe to re-run', () => {
    expect(rpcs).toContain('DROP FUNCTION IF EXISTS public.get_order_history_by_email');
    expect(rpcs).toContain('DROP FUNCTION IF EXISTS public.get_order_history_by_number');
  });
});
