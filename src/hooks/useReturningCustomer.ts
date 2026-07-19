import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SavedCheckoutInfo } from './useCheckoutInfo';
import {
  isCheckoutInfoComplete,
  mapPrefillRowToCheckoutInfo,
  type CheckoutPrefillRow,
} from '../utils/checkoutPrefill';

export interface ReturningCustomer {
  /** Prior-order contact + shipping details, or null if not recognized. */
  prefill: SavedCheckoutInfo | null;
  /** True when the prefill has every field the checkout form requires. */
  isComplete: boolean;
  /** True while the server lookup is in flight. */
  loading: boolean;
  /** True once a prior order was found for this email. */
  found: boolean;
}

const NOT_FOUND: ReturningCustomer = {
  prefill: null,
  isComplete: false,
  loading: false,
  found: false,
};

/**
 * Looks up a returning customer's most-recent order details by email via the
 * get_checkout_prefill_by_email RPC so the checkout form can prefill (and, when
 * complete, skip) itself on any device — localStorage only covers the same one.
 *
 * Gated by `enabled` (callers pass the VERIFIED member email only, so a lookup
 * exposes nothing the caller doesn't already own). Fails soft: any RPC error
 * resolves to "not recognized" rather than blocking checkout.
 */
export function useReturningCustomer(email: string | null, enabled: boolean): ReturningCustomer {
  const [state, setState] = useState<ReturningCustomer>(NOT_FOUND);

  const normalizedEmail = (email ?? '').trim();
  const shouldLookup = enabled && normalizedEmail !== '';

  useEffect(() => {
    if (!shouldLookup) {
      setState(NOT_FOUND);
      return;
    }

    let cancelled = false;
    setState({ ...NOT_FOUND, loading: true });

    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_checkout_prefill_by_email', {
          email_input: normalizedEmail,
        });
        if (cancelled) return;

        if (error) {
          console.error('Returning-customer lookup failed:', error);
          setState(NOT_FOUND);
          return;
        }

        const row = (Array.isArray(data) ? data[0] : data) as CheckoutPrefillRow | undefined;
        const prefill = mapPrefillRowToCheckoutInfo(row ?? null, normalizedEmail);
        setState({
          prefill,
          isComplete: isCheckoutInfoComplete(prefill),
          loading: false,
          found: prefill !== null,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('Returning-customer lookup failed:', err);
        setState(NOT_FOUND);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shouldLookup, normalizedEmail]);

  return state;
}
