import { Calendar, Package, Send, Sparkles, Timer, Truck, Unlock, Users } from 'lucide-react';
import type { GbStageIcon, GbStages } from '../../utils/gbLanding';

/**
 * Fixed lookup from the stored icon name to a component. The admin picks a key
 * from this set, so rendering stays a table lookup rather than resolving an
 * arbitrary identifier supplied by a settings row.
 */
const ICON_BY_NAME: Record<GbStageIcon, typeof Unlock> = {
  unlock: Unlock,
  timer: Timer,
  send: Send,
  truck: Truck,
  calendar: Calendar,
  package: Package,
  users: Users,
  sparkles: Sparkles,
};

interface GbTimelineProps {
  title: string;
  stages: GbStages;
}

const stageNumber = (index: number): string => String(index + 1).padStart(2, '0');

/**
 * The bordered timeline card.
 *
 * One <ol> serves both layouts. Below `lg` the stages stack against a vertical
 * spine on the left; from `lg` up they sit four-across with the same rule turned
 * horizontal and running behind the icon discs. Squeezing four columns onto a
 * phone would make the dates unreadable, so the rail rotates rather than shrinks.
 */
function GbTimeline({ title, stages }: GbTimelineProps) {
  return (
    <section
      aria-label={title || 'Group buy timeline'}
      className="relative w-full overflow-hidden rounded-[28px] border border-sakura-edge bg-gradient-to-b from-sakura-blush-soft to-white px-6 py-9 shadow-luxury sm:px-10 sm:py-11"
    >
      {title && (
        <div className="mb-9 flex items-center gap-4">
          <h2 className="m-0 whitespace-nowrap font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-sakura-deep">
            {title}
          </h2>
          <span className="h-px flex-1 bg-sakura-edge" aria-hidden="true" />
        </div>
      )}

      <div className="relative">
        {/* The connecting rule. Vertical through the disc centres on mobile
            (left-7 == the 56px disc's midpoint), horizontal from the first to
            the last disc centre on desktop (the four column centres sit at
            12.5% .. 87.5%). Decorative: <ol> already conveys the order. */}
        <span
          data-testid="gb-timeline-connector"
          aria-hidden="true"
          className="pointer-events-none absolute left-7 top-8 bottom-8 w-px bg-sakura-edge lg:left-[12.5%] lg:right-[12.5%] lg:top-7 lg:bottom-auto lg:h-px lg:w-auto"
        />

        <ol className="relative m-0 grid list-none grid-cols-1 gap-8 p-0 lg:grid-cols-4 lg:gap-6">
          {stages.map((stage, index) => {
            const Icon = ICON_BY_NAME[stage.icon];

            return (
              <li
                key={`${stageNumber(index)}-${stage.title}`}
                className="grid grid-cols-[auto_1fr] items-start gap-4 lg:flex lg:flex-col lg:items-center lg:gap-3 lg:text-center"
              >
                <span className="relative z-10 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-sakura-edge bg-white text-sakura-primary shadow-sm">
                  <Icon aria-hidden="true" className="h-[22px] w-[22px]" strokeWidth={1.7} />
                </span>

                <div className="min-w-0 lg:px-1">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-sakura-faint">
                    {stageNumber(index)}
                  </span>

                  <h3 className="m-0 mt-1.5 font-display text-base font-extrabold tracking-[-0.02em] text-sakura-ink sm:text-[17px]">
                    {stage.title}
                  </h3>

                  {stage.description && (
                    <p className="mt-1.5 text-sm leading-relaxed text-sakura-muted">
                      {stage.description}
                    </p>
                  )}

                  {(stage.date || stage.time) && (
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 lg:justify-center">
                      {stage.date && (
                        <span
                          data-testid="gb-stage-date"
                          className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-sakura-deep"
                        >
                          {stage.date}
                        </span>
                      )}
                      {stage.time && (
                        <span
                          data-testid="gb-stage-time"
                          className="font-mono text-[11px] tracking-[0.06em] text-sakura-faint"
                        >
                          {stage.time}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export default GbTimeline;
