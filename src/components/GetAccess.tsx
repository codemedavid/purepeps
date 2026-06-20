import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Check, Clock, Copy, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useAccessRequests } from '../hooks/useAccessRequests';
import { useActiveAccess } from '../hooks/useActiveAccess';
import type { VerifyResult } from '../hooks/useAccess';
import { ACCESS_FEE_PHP, isValidEmail } from '../utils/access';
import { formatPrice } from '../utils/currency';
import ImageUpload from './ImageUpload';
import BlossomLogo from './BlossomLogo';

interface GetAccessProps {
  onBack: () => void;
  onVerified: () => void;
  /** Lifted from MainApp's single useAccess() instance so verifying here unlocks the gated UI in-session. */
  verifyEmail: (candidate: string) => Promise<VerifyResult>;
  /** Set when a returning member was approved on a prior batch but not the open one. */
  renewalEmail?: string | null;
}

const PERKS = [
  'Checkout on this live group buy',
  'Member pricing on all vials',
  'Early access to this batch’s drops',
];

const LABEL = 'font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-sakura-soft';

function GetAccess({ onBack, onVerified, verifyEmail, renewalEmail }: GetAccessProps) {
  const { paymentMethods, loading: methodsLoading } = usePaymentMethods();
  const { submitRequest } = useAccessRequests();
  const { info: accessInfo } = useActiveAccess();

  // Per-batch fee: the open batch's admin-set fee, falling back to the constant
  // until it loads / if no batch is open.
  const accessFee = accessInfo.accessFee ?? ACCESS_FEE_PHP;
  const batchNumber = accessInfo.batchNumber;
  const isRenewal = Boolean(renewalEmail);

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

    setSubmitting(true);
    const result = await submitRequest({
      email,
      payment_method_id: selectedMethod?.id ?? null,
      payment_method_name: selectedMethod?.name ?? null,
      payment_proof_url: proofUrl,
      amount: accessFee,
    });
    setSubmitting(false);

    if (result.success) {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setFormError(result.error ?? 'Something went wrong. Please try again.');
    }
  };

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
          Thanks — your payment is now pending admin review. Once an admin approves it, come back
          here and tap "Verify email" to unlock checkout — usually within a few hours.
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
        {/* LEFT: plan + payment */}
        <div>
          <div className="bg-sakura-blush rounded-[18px] p-6">
            <div className="font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-sakura-deep">
              {batchNumber ? `Batch #${batchNumber} access` : 'Group buy access'}
            </div>
            <div className="flex items-baseline gap-2.5 mt-1.5">
              <span className="text-[44px] font-extrabold tracking-[-0.03em] text-sakura-ink">
                {formatPrice(accessFee)}
              </span>
              <span className="text-[15px] text-sakura-deep/80">per batch</span>
            </div>
            <div className="flex flex-col gap-2.5 mt-4 text-[14.5px] text-sakura-muted">
              {PERKS.map((perk) => (
                <span key={perk} className="flex items-center gap-2.5">
                  <Check className="w-[15px] h-[15px] text-sakura-primary shrink-0" strokeWidth={2.6} />
                  {perk}
                </span>
              ))}
            </div>
          </div>

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
                <div className="w-[148px] h-[148px] shrink-0 bg-white border border-sakura-ink/10 rounded-2xl p-2.5 flex items-center justify-center">
                  {selectedMethod.qr_code_url && !selectedMethod.qr_code_url.includes('pexels.com') ? (
                    <img
                      src={selectedMethod.qr_code_url}
                      alt={`${selectedMethod.name} QR`}
                      className="w-full h-full object-contain rounded-lg"
                    />
                  ) : (
                    <QRCodeSVG
                      value={selectedMethod.account_number || selectedMethod.name}
                      size={124}
                      fgColor="#17100D"
                      bgColor="#FFFFFF"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] font-semibold tracking-[0.08em] uppercase text-sakura-soft mb-1.5">
                    Scan or copy
                  </div>
                  <div className="text-sm font-bold text-sakura-ink">{selectedMethod.name}</div>
                  {selectedMethod.account_name && (
                    <div className="text-[13px] text-sakura-muted mt-0.5">{selectedMethod.account_name}</div>
                  )}
                  <div className="font-mono text-[12.5px] text-sakura-muted break-all mt-1">
                    {selectedMethod.account_number}
                  </div>
                  <button
                    onClick={() => handleCopy(selectedMethod.account_number)}
                    className="inline-flex items-center gap-1.5 mt-3 font-mono text-xs font-semibold text-sakura-primary"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
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
        <BlossomLogo size={18} />
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-sakura-faint">
          Pure Peps · members-only checkout
        </span>
      </div>
    </div>
  );
}

export default GetAccess;
