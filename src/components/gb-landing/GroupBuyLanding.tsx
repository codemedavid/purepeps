import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import BlossomLogo from '../BlossomLogo';
import GbTimeline from './GbTimeline';
import { resolveGbStatus, type GbCtaAction, type GbLandingContent } from '../../utils/gbLanding';

interface GroupBuyLandingProps {
  content: GbLandingContent;
  /** Live batch state, used when the admin leaves the badge on `auto`. */
  isBatchOpen: boolean;
  onAction: (action: GbCtaAction) => void;
}

/** A CTA renders only when it has both a label and somewhere to go. */
const isCtaVisible = (label: string, action: GbCtaAction): boolean =>
  label.trim().length > 0 && action !== 'none';

/**
 * The whole public homepage: status badge, headline, description, the GB
 * timeline card, the calls to action, and the closing note.
 *
 * Every string here arrives as content from `site_settings` — nothing about the
 * batch, its dates or its copy is written into this file. The catalog is
 * deliberately absent: it is reached through the primary CTA.
 */
function GroupBuyLanding({ content, isBatchOpen, onAction }: GroupBuyLandingProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const status = resolveGbStatus(content.statusMode, isBatchOpen);
  const isOpen = status === 'open';
  const showPrimary = isCtaVisible(content.primaryCtaLabel, content.primaryCtaAction);
  const showSecondary = isCtaVisible(content.secondaryCtaLabel, content.secondaryCtaAction);

  return (
    <section
      aria-labelledby="gb-landing-heading"
      className="relative isolate overflow-hidden bg-sakura-canvas font-display"
    >
      {/* Soft branded background shapes — the blossom mark at two scales, well
          under the text so the page reads as atmosphere, not decoration. */}
      <BlossomLogo
        monochrome="#F4DCE4"
        className="pointer-events-none absolute -top-24 left-1/2 h-[520px] w-[520px] -translate-x-1/2 opacity-40 sm:h-[720px] sm:w-[720px]"
      />
      <BlossomLogo
        monochrome="#FBE4EC"
        className="pointer-events-none absolute -bottom-32 -right-24 h-[380px] w-[380px] opacity-50"
      />

      <div
        className={`relative mx-auto flex w-full max-w-[1100px] flex-col items-center px-6 pb-24 pt-16 text-center transition-all duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none sm:pt-20 ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        {/* Status badge */}
        <div
          data-testid="gb-status-badge"
          className={`inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] ${
            isOpen ? 'bg-sakura-blush text-sakura-deep' : 'bg-sakura-mist text-sakura-muted'
          }`}
        >
          <span className="relative inline-flex" aria-hidden="true">
            <span
              className={`h-[7px] w-[7px] rounded-full ${
                isOpen ? 'bg-sakura-primary' : 'bg-sakura-soft'
              }`}
            />
            {isOpen && (
              <span className="absolute inset-0 rounded-full bg-sakura-primary animate-pp-pulse motion-reduce:animate-none" />
            )}
          </span>
          {content.statusText && <span>{content.statusText}</span>}
          <span aria-hidden="true" className="opacity-50">
            •
          </span>
          <span>{isOpen ? 'Open' : 'Closed'}</span>
        </div>

        {/* Headline */}
        <h1
          id="gb-landing-heading"
          className="m-0 mt-7 max-w-4xl text-[2.75rem] font-extrabold leading-[0.98] tracking-[-0.045em] text-sakura-ink sm:text-6xl md:text-7xl"
        >
          {content.headline}
          {content.headlineHighlight && (
            <>
              <br />
              <span data-testid="gb-headline-highlight" className="text-sakura-primary">
                {content.headlineHighlight}
              </span>
            </>
          )}
        </h1>

        {/* Supporting description */}
        {content.description && (
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-sakura-muted sm:text-lg md:text-xl">
            {content.description}
          </p>
        )}

        {/* Calls to action */}
        {(showPrimary || showSecondary) && (
          <div className="mt-9 flex w-full flex-col justify-center gap-3.5 sm:w-auto sm:flex-row">
            {showPrimary && (
              <button
                type="button"
                data-testid="gb-cta-primary"
                onClick={() => onAction(content.primaryCtaAction)}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-sakura-primary px-8 py-4 text-[17px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-sakura-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sakura-deep"
              >
                {content.primaryCtaLabel}
                <ArrowRight
                  aria-hidden="true"
                  className="h-5 w-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                />
              </button>
            )}

            {showSecondary && (
              <button
                type="button"
                data-testid="gb-cta-secondary"
                onClick={() => onAction(content.secondaryCtaAction)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-sakura-ink/20 px-7 py-4 text-[17px] font-semibold tracking-[-0.01em] text-sakura-ink transition-colors hover:bg-sakura-ink/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sakura-ink"
              >
                {content.secondaryCtaLabel}
              </button>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="mt-14 w-full sm:mt-16">
          <GbTimeline title={content.timelineTitle} stages={content.stages} />
        </div>

        {/* Closing note */}
        {content.bottomNote && (
          <p
            data-testid="gb-bottom-note"
            className="mt-10 max-w-xl text-sm font-medium leading-relaxed text-sakura-muted sm:text-base"
          >
            {content.bottomNote}
          </p>
        )}
      </div>
    </section>
  );
}

export default GroupBuyLanding;
