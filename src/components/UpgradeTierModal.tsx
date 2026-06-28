import { useEffect, useId, useState } from 'react';
import { ArrowUpCircle, Check, Clock, Layers } from 'lucide-react';
import { useDialogA11y } from './groupbuy/useDialogA11y';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useTierUpgrade, type UpgradeOption } from '../hooks/useTierUpgrade';
import { formatPrice } from '../utils/currency';
import ImageUpload from './ImageUpload';

interface UpgradeTierModalProps {
  open: boolean;
  /** Verified member email — the upgrade is charged the price difference for this member. */
  memberEmail: string;
  onClose: () => void;
  /** Called after a successful upgrade submission (e.g. to refresh access). */
  onSubmitted?: () => void;
}

/**
 * Self-serve tier upgrade for a verified member on the open batch. Lists the
 * higher tiers they can move into, shows the price difference to pay, collects a
 * payment method + proof, and submits the upgrade as a pending access request.
 * Mirrors the Get Access payment flow and the Group Buy modal shell.
 */
export function UpgradeTierModal({ open, memberEmail, onClose, onSubmitted }: UpgradeTierModalProps) {
  const titleId = useId();
  const containerRef = useDialogA11y<HTMLDivElement>(open, onClose);
  const { paymentMethods, loading: methodsLoading } = usePaymentMethods();
  const { options, loading: optionsLoading, submitUpgrade } = useTierUpgrade(open ? memberEmail : null);

  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form only when the modal opens.
  useEffect(() => {
    if (!open) return;
    setSelectedTierId(null);
    setSelectedMethodId(null);
    setProofUrl(undefined);
    setSubmitting(false);
    setSubmitted(false);
    setError(null);
  }, [open]);

  if (!open) return null;

  const selectedTier: UpgradeOption | null =
    options.find((t) => t.id === selectedTierId) ?? null;
  const selectedMethod =
    paymentMethods.find((m) => m.id === selectedMethodId) ?? paymentMethods[0] ?? null;

  const handleSubmit = async () => {
    setError(null);
    if (!selectedTier) {
      setError('Choose the tier you want to upgrade to.');
      return;
    }
    if (!proofUrl) {
      setError('Attach a screenshot of your payment.');
      return;
    }

    setSubmitting(true);
    const result = await submitUpgrade({
      tier: selectedTier,
      paymentMethodId: selectedMethod?.id ?? null,
      paymentMethodName: selectedMethod?.name ?? null,
      paymentProofUrl: proofUrl,
    });
    setSubmitting(false);

    if (result.success) {
      setSubmitted(true);
      onSubmitted?.();
    } else {
      setError(result.error ?? 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-sakura-ink/40 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-luxury border border-gray-100 p-5 animate-slideUp"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-400">
            <ArrowUpCircle className="h-5 w-5" />
          </span>
          <h2 id={titleId} className="text-base font-bold text-gray-900">
            Upgrade your access tier
          </h2>
        </div>

        {submitted ? (
          <div className="mt-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Clock className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold text-gray-900">Upgrade submitted</p>
            <p className="mt-1 text-sm text-gray-600">
              We'll review your payment and unlock the new tier shortly. Your current access stays
              active in the meantime.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full px-4 py-2 rounded-lg text-sm font-semibold bg-brand-400 hover:bg-brand-500 text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            {/* Tier options */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                <Layers className="h-3.5 w-3.5 text-brand-400" />
                Choose a higher tier
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                {optionsLoading ? (
                  <p className="text-xs text-gray-500 px-1 py-0.5">Loading upgrade options…</p>
                ) : options.length === 0 ? (
                  <p className="text-xs text-gray-500 px-1 py-0.5">
                    No upgrades available — you're already on the highest tier this batch offers, or
                    an upgrade is pending review.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {options.map((tier) => {
                      const checked = selectedTierId === tier.id;
                      return (
                        <li key={tier.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTierId(tier.id);
                              setError(null);
                            }}
                            disabled={submitting}
                            aria-pressed={checked}
                            className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg border text-left text-sm transition-colors disabled:opacity-50 ${
                              checked
                                ? 'border-brand-300 bg-brand-50'
                                : 'border-gray-200 bg-white hover:border-brand-200'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                                  checked ? 'bg-brand-400 text-white' : 'bg-gray-100'
                                }`}
                              >
                                {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                              </span>
                              <span className="truncate text-gray-800">
                                {tier.name}
                                {tier.isAllAccess && (
                                  <span className="ml-1.5 text-[10px] uppercase tracking-wide text-sakura-deep">
                                    All access
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="text-right whitespace-nowrap">
                              <span className="block font-mono font-semibold text-brand-500">
                                +{formatPrice(tier.delta)}
                              </span>
                              <span className="block text-[10px] text-gray-400">
                                {formatPrice(tier.price)} total
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {selectedTier && (
                <p className="mt-1 text-[11px] text-gray-500">
                  You already paid {formatPrice(selectedTier.currentPrice)} — pay the{' '}
                  <strong>{formatPrice(selectedTier.delta)}</strong> difference to upgrade.
                </p>
              )}
            </div>

            {/* Payment method */}
            {options.length > 0 && (
              <>
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-1.5">Pay with</div>
                  {methodsLoading ? (
                    <p className="text-xs text-gray-500">Loading payment methods…</p>
                  ) : (
                    <div className="space-y-1.5">
                      {paymentMethods.map((method) => {
                        const active = (selectedMethod?.id ?? null) === method.id;
                        return (
                          <button
                            key={method.id}
                            type="button"
                            onClick={() => setSelectedMethodId(method.id)}
                            disabled={submitting}
                            aria-pressed={active}
                            className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-left text-sm transition-colors disabled:opacity-50 ${
                              active
                                ? 'border-brand-300 bg-brand-50'
                                : 'border-gray-200 bg-white hover:border-brand-200'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block font-semibold text-gray-800 truncate">
                                {method.name}
                              </span>
                              {method.account_number && (
                                <span className="block text-[11px] text-gray-500 font-mono truncate">
                                  {method.account_number}
                                </span>
                              )}
                            </span>
                            {active && <Check className="h-4 w-4 shrink-0 text-brand-500" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedMethod?.qr_code_url && !selectedMethod.qr_code_url.includes('pexels.com') && (
                    <div className="mt-2 flex justify-center">
                      <img
                        src={selectedMethod.qr_code_url}
                        alt={`${selectedMethod.name} QR`}
                        className="max-w-[160px] w-full h-auto rounded-lg border border-gray-200"
                      />
                    </div>
                  )}
                </div>

                {/* Proof of payment */}
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-1.5">Proof of payment</div>
                  <ImageUpload
                    currentImage={proofUrl ?? null}
                    onImageChange={(url) => {
                      setProofUrl(url);
                      setError(null);
                    }}
                    folder="payment-proofs"
                  />
                </div>
              </>
            )}

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || options.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-400 hover:bg-brand-500 text-white inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <ArrowUpCircle className="h-4 w-4" />
                {submitting ? 'Submitting…' : 'Submit upgrade'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default UpgradeTierModal;
