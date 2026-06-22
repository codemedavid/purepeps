import { useEffect, useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import BlossomLogo from './BlossomLogo';
import { formatDateRange, getCountdownParts } from '../utils/groupBuySchedule';

interface HeroProps {
  onShopAll: () => void;
  onGetAccess: () => void;
  /** Open batch number for the badge (e.g. 42 → "№042"). */
  batchNumber?: number | null;
  /** Announced start of the group-buy window (TIMESTAMPTZ string). */
  startsAt?: string | null;
  /** Announced finish/deadline of the group-buy window (TIMESTAMPTZ string). */
  endsAt?: string | null;
  /** Whether a batch is currently accepting orders. */
  isBatchOpen?: boolean;
}

const TRUST = ['≥99% HPLC', '3rd-party CoA', 'Cold-chain shipped', 'Research use only'];

// Tick every second so the big hero countdown stays live down to the seconds.
const COUNTDOWN_TICK_MS = 1000;

const formatBatchLabel = (batchNumber?: number | null): string =>
  batchNumber != null ? `№${String(batchNumber).padStart(3, '0')}` : '';

const pad = (value: number): string => String(value).padStart(2, '0');

interface CountdownUnitProps {
  value: number;
  label: string;
  testId: string;
}

function CountdownUnit({ value, label, testId }: CountdownUnitProps) {
  return (
    <div className="flex w-[68px] flex-col items-center justify-center rounded-2xl border border-sakura-edge bg-white px-2 py-3 shadow-luxury sm:w-[88px] sm:py-4">
      <span
        data-testid={testId}
        className="font-display text-3xl font-extrabold leading-none tabular-nums tracking-[-0.02em] text-sakura-ink sm:text-5xl"
      >
        {pad(value)}
      </span>
      <span className="mt-2 font-mono text-[9px] tracking-[0.2em] uppercase text-sakura-faint sm:text-[10px]">
        {label}
      </span>
    </div>
  );
}

function CountdownSeparator() {
  return (
    <span
      aria-hidden="true"
      className="self-start pt-3 font-display text-2xl font-bold text-sakura-primary/50 sm:pt-5 sm:text-4xl"
    >
      :
    </span>
  );
}

function Hero({ onShopAll, onGetAccess, batchNumber, startsAt, endsAt, isBatchOpen = true }: HeroProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Keep the live countdown current. Only run the interval when there's a
  // deadline to count toward; clean up on unmount or when the date changes.
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(new Date()), COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [endsAt]);

  const batchLabel = formatBatchLabel(batchNumber);
  const dateRange = formatDateRange(startsAt, endsAt);
  const countdown = getCountdownParts(endsAt, now);
  const isLive = countdown != null && !countdown.expired;
  const statusLabel = isBatchOpen && isLive ? 'open now' : 'closed';

  return (
    <div className="bg-sakura-canvas font-display">
      {/* HERO */}
      <div className="relative flex flex-col items-center text-center px-6 pt-24 pb-24 overflow-hidden">
        {/* faint blossom watermark */}
        <BlossomLogo
          monochrome="#F4DCE4"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[640px] opacity-50 pointer-events-none"
        />

        <div
          className={`relative w-full max-w-3xl flex flex-col items-center transition-all duration-1000 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <div className="font-mono inline-flex items-center gap-2.5 text-xs font-semibold tracking-[0.08em] uppercase text-sakura-deep mb-6">
            <span className="relative inline-flex">
              <span className="w-[7px] h-[7px] rounded-full bg-sakura-primary" />
              <span className="absolute inset-0 rounded-full bg-sakura-primary animate-pp-pulse" />
            </span>
            {batchLabel ? `Group Buy ${batchLabel} · ${statusLabel}` : `Group Buy · ${statusLabel}`}
          </div>

          <h1 className="m-0 text-5xl md:text-7xl font-extrabold tracking-[-0.045em] text-sakura-ink leading-[0.97]">
            Research peptides,
            <br />
            <span className="text-sakura-primary">priced by the crowd.</span>
          </h1>

          <p className="mt-7 text-lg md:text-xl leading-relaxed text-sakura-muted max-w-xl">
            Third-party tested vials, ≥99% HPLC verified. Pool your order with the group and every
            vial gets cheaper as members commit.
          </p>

          <div className="flex flex-col sm:flex-row gap-3.5 mt-9 justify-center">
            <button
              onClick={onShopAll}
              className="inline-flex items-center justify-center gap-2 bg-sakura-primary hover:bg-sakura-deep text-white rounded-full px-8 py-4 text-[17px] font-semibold tracking-[-0.01em] transition-colors group"
            >
              Browse the catalog
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onGetAccess}
              className="inline-flex items-center justify-center gap-2 text-sakura-ink border border-sakura-ink/20 hover:bg-sakura-ink/[0.04] rounded-full px-7 py-4 text-[17px] font-semibold tracking-[-0.01em] transition-colors"
            >
              <Lock className="w-4 h-4" /> Get access
            </button>
          </div>

          {countdown && (
            <section
              aria-label="Group buy countdown"
              className="relative mt-12 w-full max-w-xl overflow-hidden rounded-[28px] border border-sakura-edge bg-gradient-to-b from-sakura-blush-soft to-white px-6 py-8 shadow-luxury sm:px-10"
            >
              {/* faint blossom accent echoing the hero watermark */}
              <BlossomLogo
                monochrome="#F4DCE4"
                className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 opacity-40"
              />

              <div className="relative flex flex-col items-center">
                {/* live / closed pill */}
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-[11px] font-semibold tracking-[0.16em] uppercase ${
                    isLive ? 'bg-sakura-blush text-sakura-deep' : 'bg-sakura-mist text-sakura-muted'
                  }`}
                >
                  {isLive && (
                    <span className="relative inline-flex">
                      <span className="h-[7px] w-[7px] rounded-full bg-sakura-primary" />
                      <span className="absolute inset-0 rounded-full bg-sakura-primary animate-pp-pulse" />
                    </span>
                  )}
                  {batchLabel ? `Group Buy ${batchLabel}` : 'Group Buy'}
                </span>

                {isLive ? (
                  <>
                    <p className="mt-4 font-display text-sm font-medium tracking-[0.02em] text-sakura-muted">
                      Closing in
                    </p>
                    <div className="mt-3 flex items-start justify-center gap-1.5 sm:gap-3">
                      <CountdownUnit value={countdown.days} label="Days" testId="countdown-days" />
                      <CountdownSeparator />
                      <CountdownUnit value={countdown.hours} label="Hrs" testId="countdown-hours" />
                      <CountdownSeparator />
                      <CountdownUnit value={countdown.minutes} label="Min" testId="countdown-minutes" />
                      <CountdownSeparator />
                      <CountdownUnit value={countdown.seconds} label="Sec" testId="countdown-seconds" />
                    </div>
                  </>
                ) : (
                  <p className="mt-4 font-display text-lg font-semibold text-sakura-ink">
                    This group buy has closed
                  </p>
                )}

                {dateRange && (
                  <p className="mt-6 font-mono text-[11px] tracking-[0.14em] uppercase text-sakura-faint">
                    {isLive ? `Window · ${dateRange}` : dateRange}
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* TRUST STRIP */}
      <div className="flex justify-center flex-wrap gap-x-9 gap-y-2 px-6 py-[18px] bg-sakura-ink font-mono text-xs font-medium tracking-[0.05em] uppercase text-[#C9B6BD]">
        {TRUST.map((item, i) => (
          <span key={item} className="flex items-center gap-9">
            {item}
            {i < TRUST.length - 1 && <span className="text-[#4A3B41]">/</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

export default Hero;
