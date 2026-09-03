import { summarizeRatings, MAX_RATING } from '../../utils/reviews';
import StarRating from './StarRating';

/** Star rows run 5 down to 1, the order every storefront shows them in. */
const DESCENDING_STARS = Array.from({ length: MAX_RATING }, (_, i) => MAX_RATING - i);

interface ReviewSummaryProps {
  /** Only `rating` is read, so this accepts any review-shaped row. */
  reviews: readonly { rating: number }[];
}

/**
 * The score header: one big average, the count behind it, and the per-star
 * breakdown that shows whether a 4.5 is "consistently good" or "mostly loved,
 * occasionally hated" — two very different things behind the same number.
 *
 * With no reviews it invites the first one rather than presenting a 0.0, which
 * reads as a bad score rather than an absent one.
 */
export default function ReviewSummary({ reviews }: ReviewSummaryProps) {
  const { average, count, histogram } = summarizeRatings(reviews);

  if (count === 0) {
    return (
      <div className="rounded-2xl border border-sakura-edge bg-sakura-blush-soft px-6 py-8 text-center">
        <p className="font-semibold text-sakura-ink">No reviews yet</p>
        <p className="mt-1 text-sm text-charcoal-500">
          Verified customers can be the first to share how it went.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sakura-edge bg-white px-6 py-6 sm:flex sm:items-center sm:gap-10">
      <div className="text-center sm:text-left">
        <div className="text-5xl font-bold leading-none tracking-tight text-sakura-ink">
          {average.toFixed(1)}
        </div>
        <div className="mt-2">
          <StarRating value={average} size={18} />
        </div>
        <p className="mt-1 text-sm text-charcoal-500">
          {count} {count === 1 ? 'review' : 'reviews'}
        </p>
      </div>

      <div className="mt-6 flex-1 space-y-1.5 sm:mt-0">
        {DESCENDING_STARS.map((star) => {
          const value = histogram[star as 1 | 2 | 3 | 4 | 5];
          // Share of the total, so the bars compare against each other rather
          // than against whichever star happens to lead.
          const percent = count === 0 ? 0 : Math.round((value / count) * 100);

          return (
            <div
              key={star}
              data-testid={`histogram-row-${star}`}
              className="flex items-center gap-3 text-xs text-charcoal-500"
            >
              <span className="w-3 text-right font-semibold text-charcoal-700">{star}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-sakura-blush">
                <span
                  className="block h-full rounded-full bg-sakura-primary"
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="w-6 tabular-nums">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
