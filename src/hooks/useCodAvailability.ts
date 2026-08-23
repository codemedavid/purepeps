import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Values the SQL trigger accepts, kept in lockstep with
 * enforce_payment_type_on_order: lower(btrim(value)) IN ('true','1','yes'). */
const TRUTHY = ['true', '1', 'yes'];

/**
 * Read the cod_enabled setting.
 *
 * An ABSENT row reads as OFF, matching the server exactly: the trigger does
 * `SELECT ... INTO v_cod_enabled` (NULL when no row) then
 * `IF NOT COALESCE(v_cod_enabled, false) THEN RAISE`. Reading it as ON here
 * would offer a payment option that every submission then gets rejected for,
 * after the shopper has filled in the whole form. A kill switch should fail
 * closed on both sides or it is not a kill switch.
 */
export function parseCodEnabled(raw: string | null | undefined): boolean {
  if (raw == null) return false;
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
 * An ABSENT row reads as OFF, matching the trigger exactly. A FAILED read is
 * different — it is not an answer — so COD stays visible and the trigger, which
 * is the real control, decides. A network blip should not silently remove a
 * payment option for everyone.
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
        // Not an answer about the setting — defer to the server rather than
        // withdrawing a payment option on a transient failure.
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
