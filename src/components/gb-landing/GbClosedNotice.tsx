import { CalendarClock } from 'lucide-react';

interface GbClosedNoticeProps {
  title: string;
  /** Free text, e.g. "October 15" or "late next month". Blank omits the line. */
  date: string;
  message: string;
}

/**
 * Shown in place of the timeline while the group buy is closed.
 *
 * The four stages describe a schedule that is currently running; between buys
 * the only useful thing to say is when the next one starts, so the card is
 * swapped rather than left showing dates that have passed. Every string here is
 * admin-written — the date is deliberately free text so it can read "October 15",
 * "Oct 15 - 18" or "announcing soon" without the page having to parse it.
 *
 * Shares the timeline card's shell (same radius, border, gradient and shadow) so
 * the page keeps one silhouette whichever state it is in.
 */
function GbClosedNotice({ title, date, message }: GbClosedNoticeProps) {
  return (
    <section
      data-testid="gb-closed-panel"
      aria-label={title || 'Next group buy'}
      className="relative w-full overflow-hidden rounded-[28px] border border-sakura-edge bg-gradient-to-b from-sakura-blush-soft to-white px-6 py-12 text-center shadow-luxury sm:px-10 sm:py-14"
    >
      <div className="mx-auto flex max-w-xl flex-col items-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-sakura-edge bg-white text-sakura-primary shadow-sm">
          <CalendarClock aria-hidden="true" className="h-[22px] w-[22px]" strokeWidth={1.7} />
        </span>

        {title && (
          <h2 className="m-0 mt-6 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-sakura-deep">
            {title}
          </h2>
        )}

        {date && (
          <p
            data-testid="gb-closed-date"
            className="m-0 mt-4 font-display text-3xl font-extrabold tracking-[-0.03em] text-sakura-ink sm:text-5xl"
          >
            {date}
          </p>
        )}

        {message && (
          <p className="mt-5 text-sm leading-relaxed text-sakura-muted sm:text-base">{message}</p>
        )}
      </div>
    </section>
  );
}

export default GbClosedNotice;
