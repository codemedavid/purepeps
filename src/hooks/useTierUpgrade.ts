import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isValidEmail, type Tier } from '../utils/access';
import { useAccessRequests } from './useAccessRequests';

/**
 * A higher tier the member may upgrade INTO on the open batch. Extends the base
 * Tier with the price the member already paid and the difference still owed.
 */
export interface UpgradeOption extends Tier {
  /** Price of the member's current approved tier on the open batch. */
  currentPrice: number;
  /** Amount to pay for this upgrade = this tier's price − currentPrice. */
  delta: number;
}

interface RawUpgradeOption {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  is_all_access: boolean;
  category_ids: string[] | null;
  current_price: number | string | null;
  delta: number | string | null;
}

function toNumber(value: number | string | null): number {
  const n = value != null ? Number(value) : 0;
  return Number.isFinite(n) ? n : 0;
}

function normalizeOption(raw: RawUpgradeOption): UpgradeOption {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    price: toNumber(raw.price),
    isAllAccess: Boolean(raw.is_all_access),
    categoryIds: raw.is_all_access ? null : raw.category_ids ?? [],
    currentPrice: toNumber(raw.current_price),
    delta: toNumber(raw.delta),
  };
}

interface SubmitUpgradeInput {
  tier: UpgradeOption;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  paymentProofUrl: string;
}

interface SubmitResult {
  success: boolean;
  error?: string;
}

/**
 * Self-serve tier upgrades for a verified member on the open batch. Loads the
 * higher tiers they can move into (via get_upgrade_options) and submits an
 * upgrade as a new pending access request charging only the price difference.
 * The list is empty until an email is provided, and after a successful submit
 * (the new pending request hides further options server-side).
 */
export function useTierUpgrade(email: string | null) {
  const { submitRequest } = useAccessRequests();
  const [options, setOptions] = useState<UpgradeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const normalized = (email ?? '').trim().toLowerCase();
    if (!isValidEmail(normalized)) {
      setOptions([]);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      const { data, error: rpcError } = await supabase.rpc('get_upgrade_options', {
        p_email: normalized,
      });
      if (rpcError) throw rpcError;
      setOptions(((data ?? []) as RawUpgradeOption[]).map(normalizeOption));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load upgrade options';
      console.error('Error loading upgrade options:', err);
      setError(message);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitUpgrade = useCallback(
    async (input: SubmitUpgradeInput): Promise<SubmitResult> => {
      const normalized = (email ?? '').trim().toLowerCase();
      if (!isValidEmail(normalized)) {
        return { success: false, error: 'A verified member email is required to upgrade.' };
      }

      const result = await submitRequest({
        email: normalized,
        payment_method_id: input.paymentMethodId,
        payment_method_name: input.paymentMethodName,
        payment_proof_url: input.paymentProofUrl,
        amount: input.tier.delta,
        tier_id: input.tier.id,
      });

      return result.success
        ? { success: true }
        : { success: false, error: result.error };
    },
    [email, submitRequest],
  );

  return { options, loading, error, refresh, submitUpgrade };
}
