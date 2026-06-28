import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Clock, Copy, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useAccessRequests } from '../hooks/useAccessRequests';
import { useActiveAccess } from '../hooks/useActiveAccess';
import { useAccessTiers } from '../hooks/useAccessTiers';
import { useCategories } from '../hooks/useCategories';
import type { VerifyResult } from '../hooks/useAccess';
import { ACCESS_FEE_PHP, isValidEmail } from '../utils/access';
import { formatPrice } from '../utils/currency';
import ImageUpload from './ImageUpload';

interface GetAccessProps {
  onBack: () => void;
  onVerified: () => void;
  /** Lifted from MainApp's single useAccess() instance so verifying here unlocks the gated UI in-session. */
  verifyEmail: (candidate: string) => Promise<VerifyResult>;
  /** Remember a just-paid email so its approval auto-unlocks checkout without a manual re-verify. */
  watchPendingEmail: (candidate: string) => void;
  /** True once the member's access is approved — drives auto-advance from the pending screen. */
  isVerified: boolean;
  /** Set when a returning member was approved on a prior batch but not the open one. */
  renewalEmail?: string | null;
}

const LABEL = 'font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-sakura-soft';

function GetAccess({
  onBack,
  onVerified,
  verifyEmail,
  watchPendingEmail,
  isVerified,
  renewalEmail,
}: GetAccessProps) {
  const { paymentMethods, loading: methodsLoading } = usePaymentMethods();
  const { submitRequest } = useAccessRequests();
  const { info: accessInfo } = useActiveAccess();
  const { tiers, loading: tiersLoading } = useAccessTiers();
  const { categories } = useCategories();

  const batchNumber = accessInfo.batchNumber;
  const isRenewal = Boolean(renewalEmail);

  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const selectedTier =
    tiers.find((t) => t.id === selectedTierId) ?? tiers[0] ?? null;

  // The amount to pay = the chosen tier's price, falling back to the batch fee /
  // constant while tiers load or if none are configured.
  const accessFee = selectedTier?.price ?? accessInfo.accessFee ?? ACCESS_FEE_PHP;

  // Map a tier's category ids to display names (all-access => null => "Everything").
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [email, setEmail] = useState(renewalEmail ?? '');
  const [proofUrl, setProofUrl] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // "Already paid?" verify-email panel
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyMsg, setVerifyMsg] = useState<{ tone: 'ok' | 'pending' | 'error'; text: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const selectedMethod =
    paymentMethods.find((m) => m.id === selectedMethodId) ?? paymentMethods[0] ?? null;

  // Only treat an admin-uploaded image as a real QR — never auto-generate one,
  // since a QR built from the account number/name isn't actually scannable to pay.
  const hasRealQr = Boolean(
    selectedMethod?.qr_code_url && !selectedMethod.qr_code_url.includes('pexels.com'),
  );

  const handleCopy = (value: string) => {
    navigator.clipboard?.writeText(value).catch(() => undefined);
  };

  const handleVerify = async () => {
    if (!isValidEmail(verifyInput)) {
      setVerifyMsg({ tone: 'error', text: 'Enter a valid email address.' });
      return;
    }
    setVerifying(true);
    const result = await verifyEmail(verifyInput);
    setVerifying(false);
    if (result.ok) {
      setVerifyMsg({ tone: 'ok', text: 'Access verified — checkout unlocked.' });
      setTimeout(onVerified, 700);
    } else if (result.status === 'pending') {
      setVerifyMsg({ tone: 'pending', text: 'Your payment is still pending admin review.' });
    } else {
      setVerifyMsg({ tone: 'error', text: 'No approved access found for this email yet.' });
    }
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!isValidEmail(email)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (!proofUrl) {
      setFormError('Please attach a screenshot of your payment.');
      return;
    }
    if (!selectedTier) {
      setFormError('Please choose an access tier.');
      return;
    }

    setSubmitting(true);
    const result = await submitRequest({
      email,
      payment_method_id: selectedMethod?.id ?? null,
      payment_method_name: selectedMethod?.name ?? null,
      payment_proof_url: proofUrl,
      amount: accessFee,
      tier_id: selectedTier.id,
    });
    setSubmitting(false);

    if (result.success) {
      // Remember the paid email so approval auto-unlocks checkout in the
      // background — the member never has to come back and re-verify by hand.
      watchPendingEmail(email);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setFormError(result.error ?? 'Something went wrong. Please try again.');
    }
  };

  // The moment access is approved while the member sits on the pending screen,
  // jump them straight to checkout — the goal is to order immediately.
  useEffect(() => {
    if (submitted && isVerified) onVerified();
  }, [submitted, isVerified, onVerified]);

  // ---- PENDING STATE ----------------------------------------------------
  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center font-display">
        <div className="w-[72px] h-[72px] rounded-full bg-sakura-blush flex items-center justify-center mx-auto mb-6">
          <Clock className="w-8 h-8 text-sakura-primary" strokeWidth={2} />
        </div>
        <h1 className="text-4xl font-extrabold tracking-[-0.04em] text-sakura-ink leading-tight">
          Payment submitted
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-sakura-muted">
          Thanks — your payment is now pending admin review, usually within a few hours. You can keep
          this page open or come back later; checkout unlocks automatically the moment it’s approved,
          and we’ll take you straight there.
        </p>
        <div className="inline-flex items-center gap-2.5 mt-7 bg-sakura-blush-soft border border-sakura-edge rounded-full px-[18px] py-2.5 font-mono text-xs font-semibold tracking-[0.06em] uppercase text-sakura-deep">
          <span className="relative inline-flex">
            <span className="w-2 h-2 rounded-full bg-sakura-primary" />
            <span className="absolute inset-0 rounded-full bg-sakura-primary animate-pp-pulse" />
          </span>
          Status · pending review
        </div>

        {proofUrl && (
          <div className="flex items-center gap-3.5 mt-8 mx-auto max-w-sm bg-white border border-sakura-ink/10 rounded-2xl p-3.5 text-left">
            <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-sakura-blush-soft">
              <img src={proofUrl} alt="Payment proof" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-sm font-bold text-sakura-ink">Payment proof attached</div>
              <div className="font-mono text-[11.5px] text-sakura-sage mt-0.5">
                {formatPrice(accessFee)} · {selectedMethod?.name ?? 'Payment'}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-center mt-8">
          <button
            onClick={onBack}
            className="inline-flex items-center bg-sakura-ink text-white rounded-full px-7 py-3.5 text-[15px] font-semibold"
          >
            Back to catalog
          </button>
          <button
            onClick={() => setSubmitted(false)}
            className="inline-flex items-center text-sakura-ink border border-sakura-ink/20 rounded-full px-6 py-3.5 text-[15px] font-semibold hover:bg-sakura-ink/[0.04] transition-colors"
          >
            Edit submission
          </button>
        </div>
      </div>
    );
  }

  // ---- FORM -------------------------------------------------------------
  return (
    <div className="max-w-5xl mx-auto px-6 py-12 font-display">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.04em] uppercase text-sakura-soft hover:text-sakura-deep transition-colors mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      {isRenewal && (
        <div className="mb-5 flex items-start gap-3 bg-sakura-blush border border-sakura-edge rounded-2xl p-4">
          <RefreshCw className="w-5 h-5 text-sakura-primary shrink-0 mt-0.5" strokeWidth={2.2} />
          <div>
            <div className="text-sm font-bold text-sakura-ink">
              {batchNumber ? `Batch #${batchNumber} is open` : 'A new group buy is open'} — renew your
              access
            </div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-sakura-muted">
              Access is per batch. Your previous approval has expired with the last group buy — send
              this batch’s access fee below to unlock checkout again.
            </p>
          </div>
        </div>
      )}

      <div className="font-mono text-xs font-semibold tracking-[0.1em] uppercase text-sakura-deep mb-3.5">
        Members only · paid access{batchNumber ? ` · batch #${batchNumber}` : ''}
      </div>
      <h1 className="text-5xl font-extrabold tracking-[-0.04em] text-sakura-ink leading-[1.0]">
        {isRenewal ? 'Renew access' : 'Get access'}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-sakura-muted max-w-xl">
        Send this batch’s access fee, attach a screenshot of your payment, and submit. An admin
        reviews it and unlocks checkout for the current group buy — usually within a few hours.
      </p>

      {/* Already paid? verify email */}
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3 bg-white border border-sakura-ink/10 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-sakura-ink shrink-0">
          <ShieldCheck className="w-4 h-4 text-sakura-sage" /> Already approved?
        </div>
        <input
          type="email"
          value={verifyInput}
          onChange={(e) => {
            setVerifyInput(e.target.value);
            setVerifyMsg(null);
          }}
          placeholder="you@lab.org"
          className="flex-1 bg-sakura-canvas border border-sakura-ink/10 rounded-xl px-4 py-2.5 font-mono text-sm text-sakura-ink focus:outline-none focus:ring-2 focus:ring-sakura-primary/40"
        />
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="bg-sakura-ink text-white rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {verifying ? 'Checking…' : 'Verify email'}
        </button>
      </div>
      {verifyMsg && (
        <div
          className={`mt-2 text-sm font-medium ${
            verifyMsg.tone === 'ok'
              ? 'text-sakura-sage'
              : verifyMsg.tone === 'pending'
                ? 'text-sakura-deep'
                : 'text-red-500'
          }`}
        >
          {verifyMsg.text}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-9 mt-10 items-start">
        {/* LEFT: tier choice + payment */}
        <div>
          <div className={`${LABEL} mb-2.5`}>Choose your tier</div>
          {tiersLoading ? (
            <div className="text-sm text-sakura-faint">Loading tiers…</div>
          ) : tiers.length === 0 ? (
            <div className="text-sm text-sakura-faint">No access tiers configured yet.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {tiers.map((tier) => {
                const active = selectedTier?.id === tier.id;
                const unlocks = tier.isAllAccess
                  ? ['Every category — full catalog']
                  : (tier.categoryIds ?? []).map(categoryName);
                return (
                  <button
                    key={tier.id}
                    onClick={() => setSelectedTierId(tier.id)}
                    className={`text-left rounded-[18px] p-5 border-[1.5px] transition-colors ${
                      active
                        ? 'bg-sakura-blush border-sakura-primary'
                        : 'bg-white border-sakura-ink/10 hover:border-sakura-primary/40'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-lg font-extrabold tracking-[-0.02em] text-sakura-ink">
                        {tier.name}
                      </span>
                      <span className="text-2xl font-extrabold tracking-[-0.02em] text-sakura-primary">
                        {formatPrice(tier.price)}
                      </span>
                    </div>
                    {tier.description && (
                      <p className="mt-1 text-[13.5px] leading-relaxed text-sakura-muted">
                        {tier.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {unlocks.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center gap-1 font-mono text-[10.5px] text-sakura-deep bg-white/70 border border-sakura-edge rounded-md px-2 py-1"
                        >
                          <Check className="w-3 h-3 text-sakura-primary shrink-0" strokeWidth={2.6} />
                          {label}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
              <p className="text-[12.5px] text-sakura-faint mt-0.5">
                Access is per batch{batchNumber ? ` · batch #${batchNumber}` : ''}. Categories outside
                your tier stay view-only.
              </p>
            </div>
          )}

          <div className={`${LABEL} mb-2.5 mt-6`}>Pay with</div>
          {methodsLoading ? (
            <div className="text-sm text-sakura-faint">Loading payment methods…</div>
          ) : paymentMethods.length === 0 ? (
            <div className="text-sm text-sakura-faint">No payment methods configured yet.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {paymentMethods.map((method) => {
                const active = selectedMethod?.id === method.id;
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethodId(method.id)}
                    className={`flex-1 min-w-[88px] text-center px-1.5 py-3 rounded-xl text-[13px] font-semibold border-[1.5px] transition-colors ${
                      active
                        ? 'bg-sakura-ink text-white border-sakura-ink'
                        : 'bg-white text-sakura-muted border-sakura-ink/10 hover:border-sakura-primary/40'
                    }`}
                  >
                    {method.name}
                  </button>
                );
              })}
            </div>
          )}

          {selectedMethod && (
            <div className="mt-3.5 bg-white border border-sakura-ink/10 rounded-[18px] p-5">
              <div className="flex gap-5 items-center">
                {hasRealQr && (
                  <div className="w-[148px] h-[148px] shrink-0 bg-white border border-sakura-ink/10 rounded-2xl p-2.5 flex items-center justify-center">
                    <img
                      src={selectedMethod.qr_code_url}
                      alt={`${selectedMethod.name} QR`}
                      className="w-full h-full object-contain rounded-lg"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] font-semibold tracking-[0.08em] uppercase text-sakura-soft mb-1.5">
                    {hasRealQr ? 'Scan or copy' : 'Send to'}
                  </div>
                  <div className="text-sm font-bold text-sakura-ink">{selectedMethod.name}</div>
                  {selectedMethod.account_name && (
                    <div className="text-[13px] text-sakura-muted mt-0.5">{selectedMethod.account_name}</div>
                  )}
                  {selectedMethod.account_number && (
                    <>
                      <div className="font-mono text-[12.5px] text-sakura-muted break-all mt-1">
                        {selectedMethod.account_number}
                      </div>
                      <button
                        onClick={() => handleCopy(selectedMethod.account_number)}
                        className="inline-flex items-center gap-1.5 mt-3 font-mono text-xs font-semibold text-sakura-primary"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-baseline mt-4 pt-4 border-t border-sakura-ink/10">
                <span className="font-mono text-xs tracking-[0.04em] uppercase text-sakura-faint">
                  Send exactly
                </span>
                <span className="font-mono text-2xl font-semibold text-sakura-primary">
                  {formatPrice(accessFee)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: proof + submit */}
        <div>
          <div className={`${LABEL} mb-2.5`}>Payment screenshot</div>
          <div className="bg-sakura-blush-soft border border-sakura-ink/10 rounded-2xl p-4">
            <ImageUpload
              currentImage={proofUrl}
              onImageChange={(url) => setProofUrl(url)}
              folder="payment-proofs"
            />
          </div>

          <div className={`${LABEL} mt-6 mb-2.5`}>Your email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFormError(null);
            }}
            placeholder="you@lab.org"
            className="w-full bg-white border border-sakura-ink/10 rounded-xl px-4 py-3.5 font-mono text-sm text-sakura-ink placeholder:text-sakura-soft focus:outline-none focus:ring-2 focus:ring-sakura-primary/40"
          />

          {formError && <div className="mt-3 text-sm font-medium text-red-500">{formError}</div>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-5 w-full flex items-center justify-center gap-2 bg-sakura-primary hover:bg-sakura-deep text-white rounded-full py-4 text-base font-semibold transition-colors disabled:opacity-60"
          >
            <Lock className="w-4 h-4" /> {submitting ? 'Submitting…' : 'Submit for review'}
          </button>
          <div className="mt-3.5 text-center text-[13px] leading-relaxed text-sakura-faint">
            An admin verifies your payment and unlocks checkout. Come back and tap "Verify email"
            once you're approved.
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mt-12 opacity-60">
        <img src="/logo.png" alt="Pure Peps" className="h-6 w-auto object-contain" />
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-sakura-faint">
          members-only checkout
        </span>
      </div>
    </div>
  );
}

export default GetAccess;
