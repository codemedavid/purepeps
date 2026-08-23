import { describe, it, expect } from 'vitest';
import { parseCodEnabled } from './useCodAvailability';

describe('parseCodEnabled', () => {
  it('accepts the values an admin toggle writes', () => {
    expect(parseCodEnabled('true')).toBe(true);
    expect(parseCodEnabled('1')).toBe(true);
    expect(parseCodEnabled('yes')).toBe(true);
  });

  it('is case and whitespace tolerant', () => {
    expect(parseCodEnabled('  TRUE  ')).toBe(true);
    expect(parseCodEnabled('Yes')).toBe(true);
  });

  it('treats anything else as switched off', () => {
    expect(parseCodEnabled('false')).toBe(false);
    expect(parseCodEnabled('0')).toBe(false);
    expect(parseCodEnabled('no')).toBe(false);
    expect(parseCodEnabled('maybe')).toBe(false);
  });

  it('treats an unseeded setting as OFF, exactly as the trigger does', () => {
    // The trigger's SELECT INTO leaves NULL when no row exists, and
    // COALESCE(NULL, false) rejects. Reading it as ON here would offer COD and
    // then have every submission rejected server-side.
    expect(parseCodEnabled(null)).toBe(false);
    expect(parseCodEnabled(undefined)).toBe(false);
  });

  it('agrees with the SQL trigger, which accepts exactly true/1/yes', () => {
    // enforce_payment_type_on_order: lower(btrim(value)) IN ('true','1','yes').
    // A client that disagreed would either hide an available option or offer a
    // rejected one.
    for (const accepted of ['true', '1', 'yes']) {
      expect(parseCodEnabled(accepted)).toBe(true);
    }
  });
});
