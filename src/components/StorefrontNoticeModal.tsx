import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { StorefrontNotice, splitLines, splitParagraphs } from '../utils/storefrontNotice';

const FALLBACK_BUTTON_LABEL = 'I Understand & Agree';

type Props = {
  notice: StorefrontNotice;
  onAccept: () => void;
  /** Renders the same markup as a non-interactive sample for the admin editor. */
  isPreview?: boolean;
};

/**
 * Blocking "Important Notice" dialog. Deliberately has no close affordance —
 * neither Escape nor a backdrop click dismisses it, because the shopper must
 * acknowledge the research-use disclaimer before browsing. Every string is
 * admin-editable; empty optional sections are omitted entirely.
 */
export default function StorefrontNoticeModal({ notice, onAccept, isPreview = false }: Props) {
  const acceptRef = useRef<HTMLButtonElement>(null);

  // Focus the only actionable control so keyboard and screen-reader users can
  // acknowledge without hunting for it. A preview is decorative, so it never
  // takes focus away from the admin form it sits next to.
  useEffect(() => {
    if (isPreview) return;
    acceptRef.current?.focus();
  }, [isPreview]);

  const paragraphs = splitParagraphs(notice.body);
  const policyLines = splitLines(notice.policyLines);
  const policyTitle = notice.policyTitle.trim();
  const highlight = notice.highlight.trim();
  const subtitle = notice.subtitle.trim();
  const footerNote = notice.footerNote.trim();
  const title = notice.title.trim();
  const buttonLabel = notice.buttonLabel.trim() || FALLBACK_BUTTON_LABEL;
  const hasPolicy = policyTitle.length > 0 || policyLines.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal-900/50 p-4 backdrop-blur-sm">
      <div
        {...(isPreview
          ? { 'aria-hidden': true }
          : { role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'storefront-notice-title' })}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start gap-4 rounded-t-2xl bg-sakura-blush-soft px-6 py-5 border-b border-sakura-edge">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
            <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden="true" />
          </div>
          <div>
            <h2 id={isPreview ? undefined : 'storefront-notice-title'} className="text-xl font-bold text-sakura-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-charcoal-500">{subtitle}</p>}
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="text-sm leading-relaxed text-charcoal-800 whitespace-pre-line">
              {paragraph}
            </p>
          ))}

          {highlight && (
            <div
              data-testid="notice-highlight"
              className="rounded-xl border border-sakura-edge bg-sakura-blush-soft px-4 py-3 text-center text-sm font-bold text-brand-400"
            >
              {highlight}
            </div>
          )}

          {hasPolicy && (
            <div
              data-testid="notice-policy"
              className="rounded-xl border border-sakura-edge bg-sakura-blush-soft px-4 py-3"
            >
              {policyTitle && <p className="text-sm font-bold text-sakura-ink">{policyTitle}</p>}
              {policyLines.length > 0 && (
                <ul className={`space-y-1 ${policyTitle ? 'mt-2' : ''}`}>
                  {policyLines.map((line, index) => (
                    <li key={index} className="text-sm text-charcoal-800">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            ref={acceptRef}
            type="button"
            onClick={isPreview ? undefined : onAccept}
            disabled={isPreview}
            tabIndex={isPreview ? -1 : undefined}
            className="w-full rounded-xl bg-brand-400 px-4 py-3 text-base font-bold text-white shadow-md transition-colors hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2"
          >
            {buttonLabel}
          </button>

          {footerNote && <p className="text-center text-xs text-charcoal-400">{footerNote}</p>}
        </div>
      </div>
    </div>
  );
}
