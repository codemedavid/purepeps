import { useCallback, useEffect, useState } from 'react';
import { Gift, Upload, Check, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { uploadToImageKit } from '../../lib/imagekit';
import { useGroupBuyClaims } from '../../hooks/useGroupBuyClaims';
import type { GroupBuyRemainingItem } from '../../types';

const PROOF_FOLDER = 'payment-proofs';

// Allowlisted image MIME types and the canonical extension we store for each.
// The extension is derived from the validated MIME type, never the caller-controlled
// file name, so an attacker cannot smuggle an arbitrary extension into the bucket path.
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10 MB

interface LeftoverClaimPanelProps {
  /** The batch the root order belongs to. */
  batchId: string;
  /** Order number of the root order — claims attach to it. */
  orderNumber: string;
  /** Called with the new add-on order number once a claim is filed, so the
   *  parent can re-track and surface the bundle including the new claim. */
  onClaimed: (newOrderNumber: string) => void;
}

interface ClaimResult {
  orderNumber: string;
  total: number;
}

/**
 * Customer-facing leftover-claim card shown under the tracking timeline while the
 * order's group-buy batch is `finalizing`. Lists each capped product that still
 * has surplus (freed by cancellations) and lets the original customer claim extra
 * units as an add-on order against their existing order number. PII-free surplus
 * comes from get_group_buy_remaining; the claim itself goes through the
 * anon-callable claim_group_buy_leftover RPC, which re-validates email + caps.
 */
export function LeftoverClaimPanel({ batchId, orderNumber, onClaimed }: LeftoverClaimPanelProps) {
  const { fetchRemaining, submitClaim } = useGroupBuyClaims();

  const [items, setItems] = useState<GroupBuyRemainingItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Per-product requested quantities, keyed by product_id.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [email, setEmail] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingItems(true);
    setLoadError(null);

    fetchRemaining(batchId)
      .then((remaining) => {
        if (!active) return;
        // Only surface products that actually have surplus to claim.
        setItems(remaining.filter((item) => item.remaining > 0));
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Could not load claimable units.';
        console.error('Failed to load leftover units:', err);
        setLoadError(message);
      })
      .finally(() => {
        if (active) setLoadingItems(false);
      });

    return () => {
      active = false;
    };
  }, [batchId, fetchRemaining]);

  const setQuantity = useCallback((productId: string, max: number, rawValue: string) => {
    const parsed = Number.parseInt(rawValue, 10);
    const next = Number.isNaN(parsed) ? 0 : Math.min(max, Math.max(0, parsed));
    setQuantities((previous) => ({ ...previous, [productId]: next }));
  }, []);

  // Build the immutable list of {product_id, quantity} the customer requested.
  const selectedItems = items
    .map((item) => ({ product_id: item.product_id, quantity: quantities[item.product_id] ?? 0 }))
    .filter((entry) => entry.quantity > 0);

  const hasSelection = selectedItems.length > 0;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = hasSelection && isEmailValid && !submitting;

  const uploadProof = useCallback(async (file: File): Promise<string> => {
    // Validate at the client boundary. The HTML `accept` attribute is advisory
    // only — enforce the real allowlist + size cap before touching storage.
    const extension = ALLOWED_IMAGE_TYPES[file.type];
    if (!extension) {
      throw new Error('Payment proof must be a JPEG, PNG, WebP, or GIF image.');
    }
    if (file.size > MAX_PROOF_BYTES) {
      throw new Error('Payment proof must be 10 MB or smaller.');
    }

    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

    try {
      const { url } = await uploadToImageKit({
        file,
        fileName,
        folder: `${PROOF_FOLDER}/claims`,
      });
      return url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Failed to upload payment proof: ${message}`);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      let paymentProofUrl: string | null = null;
      if (proofFile) {
        paymentProofUrl = await uploadProof(proofFile);
      }

      const claim = await submitClaim({
        orderNumber,
        email: email.trim(),
        items: selectedItems,
        paymentProofUrl,
      });

      setResult({ orderNumber: claim.order_number, total: claim.total });
      onClaimed(claim.order_number);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit your claim. Please try again.';
      console.error('Failed to submit leftover claim:', err);
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, proofFile, uploadProof, submitClaim, orderNumber, email, selectedItems, onClaimed]);

  // While loading, render nothing rather than an empty card flash.
  if (loadingItems) {
    return (
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
        <span>Checking for claimable leftover units…</span>
      </div>
    );
  }

  // Surface a load error but do not block the rest of the page.
  if (loadError) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-800">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="text-sm">{loadError}</p>
      </div>
    );
  }

  // No surplus — render nothing so the card never shows empty.
  if (items.length === 0) {
    return null;
  }

  // Success state — show the new add-on order number.
  if (result) {
    return (
      <div className="bg-white rounded-2xl shadow-xl border-2 border-teal-500/40 overflow-hidden">
        <div className="bg-teal-500 p-6 text-white flex items-center gap-3">
          <Check className="w-6 h-6 text-white" />
          <h3 className="text-xl font-bold">Leftover claim submitted</h3>
        </div>
        <div className="p-6 md:p-8 space-y-3">
          <p className="text-gray-700">
            Your add-on has been added to this group buy. Keep this reference for tracking:
          </p>
          <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 text-center">
            <p className="text-xs uppercase tracking-wider text-teal-700 font-bold mb-1">Add-on Order Number</p>
            <p className="font-mono text-2xl font-bold text-navy-900">{result.orderNumber}</p>
            <p className="text-sm text-gray-600 mt-2">
              Total: <span className="font-bold text-navy-900">₱{result.total.toLocaleString()}</span>
            </p>
          </div>
          <p className="text-xs text-gray-500 text-center">
            This add-on now appears in the &ldquo;Add-ons in this group buy&rdquo; section above.
          </p>
        </div>
      </div>
    );
  }

  // Claim form.
  return (
    <div className="bg-white rounded-2xl shadow-xl border-2 border-gold-500/40 overflow-hidden">
      <div className="bg-navy-900 p-6 text-white flex items-center gap-3">
        <Gift className="w-6 h-6 text-gold-400" />
        <div>
          <h3 className="text-xl font-bold">Claim leftover units</h3>
          <p className="text-sm text-gray-300">
            This batch is finalizing and some units freed up. Grab extra before it locks.
          </p>
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        {/* Per-product quantity inputs */}
        <div className="space-y-3">
          {items.map((item) => {
            const value = quantities[item.product_id] ?? 0;
            return (
              <div
                key={item.product_id}
                className="flex items-center justify-between gap-4 bg-gray-50 rounded-xl p-4 border border-gray-200"
              >
                <div className="min-w-0">
                  <p className="font-bold text-navy-900 truncate">{item.product_name ?? 'Item'}</p>
                  <p className="text-xs text-gray-500">{item.remaining} left to claim</p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={item.remaining}
                  value={value === 0 ? '' : value}
                  onChange={(e) => setQuantity(item.product_id, item.remaining, e.target.value)}
                  placeholder="0"
                  className="w-20 text-center px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-navy-900 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all text-navy-900 font-bold"
                />
              </div>
            );
          })}
        </div>

        {/* Email — must match the order */}
        <div>
          <label htmlFor="claim-email" className="block text-xs font-bold text-navy-900 uppercase tracking-wider mb-2">
            Confirm your email
          </label>
          <input
            id="claim-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-navy-900 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all text-navy-900"
          />
          <p className="text-xs text-gray-500 mt-2">
            Use the same email as order <span className="font-mono font-bold">{orderNumber}</span>. The claim is
            rejected if it does not match.
          </p>
        </div>

        {/* Optional payment proof */}
        <div>
          <p className="block text-xs font-bold text-navy-900 uppercase tracking-wider mb-2">
            Payment proof (optional)
          </p>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center hover:border-teal-400 transition-colors bg-gray-50/50">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              className="hidden"
              id="claim-proof-upload"
            />
            <label htmlFor="claim-proof-upload" className="cursor-pointer flex flex-col items-center">
              {proofFile ? (
                <>
                  <Check className="w-8 h-8 text-teal-600 mb-2" />
                  <p className="font-medium text-navy-900 text-sm">{proofFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">Click to change file</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="font-medium text-navy-900 text-sm">Upload payment screenshot</p>
                  <p className="text-xs text-gray-500 mt-1">GCash / bank transfer receipt</p>
                </>
              )}
            </label>
          </div>
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{submitError}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="w-full bg-teal-500 hover:bg-teal-600 text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Submitting claim…
            </>
          ) : (
            <>
              Claim leftover units
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
        {!hasSelection && (
          <p className="text-xs text-gray-400 text-center -mt-3">Enter a quantity for at least one item.</p>
        )}
      </div>
    </div>
  );
}

export default LeftoverClaimPanel;
