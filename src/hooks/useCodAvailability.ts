import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Values the SQL trigger accepts, kept in lockstep with
 * enforce_payment_type_on_order: lower(btrim(value)) IN ('true','1','yes'). */
const TRUTHY = ['true', '1', 'yes'];

/**
 * Read the cod_enabled setting. An ABSENT row means the setting was never
 * seeded, which is not the same as an admin switching COD off — so it reads as
 * enabled, matching the migration's default.
 */
export function parseCodEnabled(raw: string | null | undefined): boolean {
  if (raw == null) return true;
  return TRUTHY.includes(String(raw).trim().toLowerCase());
}

/**
 * Whether Cash on Delivery is currently offered, from site_settings.cod_enabled.
 *
 * This is the CLIENT half of the kill switch: it hides the COD option so a
 * shopper never fills in a whole checkout only to be rejected at submit. It is
 * NOT the control — anon inserts go straight to the table, so the authoritative
 * check lives in enforce_payment_type_on_order (20260824000100).
 *
 * Fails OPEN to the server's judgement: if the setting cannot be read we leave
 * COD visible and let the trigger reject it, rather than silently removing a
 * payment option because of a transient network error.
 */
export function useCodAvailability(): { codEnabled: boolean; loading: boolean } {
  const [codEnabled, setCodEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('site_settings')
          .select('value')
          .eq('id', 'cod_enabled')
          .maybeSingle();

        if (error) throw error;
        if (cancelled) return;

        setCodEnabled(parseCodEnabled(data?.value));
      } catch (err) {
        console.error('Error reading cod_enabled setting:', err);
        if (!cancelled) setCodEnabled(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { codEnabled, loading };
}
