import { BadgeCheck } from 'lucide-react';
import { ANONYMOUS_DISPLAY_NAME, type PublicReview } from '../../utils/reviews';
import StarRating from './StarRating';

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface ReviewCardProps {
  review: PublicReview;
}

/**
 * One published review.
 *
 * Every field is read individually — never spread onto the DOM, never dumped
 * through a generic renderer. `product_reviews` rows carry reviewer_name,
 * reviewer_email, reviewer_phone and order_number alongside the public content,
 * and although get_approved_reviews' RETURNS TABLE already excludes them, this
 * component is the last place such a mistake would become publicly visible.
 * Naming each field keeps an over-wide row inert instead of leaking it.
 *
 * The Verified Purchase badge is a fact about the pipeline, not a claim: a row
 * can only exist if submit_product_review matched a DELIVERED order.
 */
export default function ReviewCard({ review }: ReviewCardProps) {
  const displayName = review.display_name?.trim() || ANONYMOUS_DISPLAY_NAME;
  const day = formatDay(review.created_at);
  const product = [review.product_name, review.variation_name].filter(Boolean).join(' · ');

  return (
    <article className="rounded-2xl border border-sakura-edge bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-sakura-ink">{displayName}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <BadgeCheck width={12} height={12} aria-hidden="true" />
          Verified Purchase
        </span>
        {day && <time className="text-xs text-charcoal-400">{day}</time>}
      </header>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarRating value={review.rating} />
        {product && <span className="text-xs text-charcoal-500">{product}</span>}
      </div>

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-charcoal-700">
        {review.body}
      </p>

      {review.media_urls.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {review.media_urls.map((url, index) => (
            <li key={url}>
              <img
                src={url}
                alt={`Photo ${index + 1} from ${displayName}'s review`}
                loading="lazy"
                width={96}
                height={96}
                className="h-24 w-24 rounded-xl border border-sakura-edge object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      {review.admin_reply && (
        <div className="mt-4 rounded-xl border-l-2 border-sakura-primary bg-sakura-blush-soft px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sakura-deep">
            Pure Peps replied
          </p>
          <p className="mt-1 text-sm leading-relaxed text-charcoal-700">{review.admin_reply}</p>
        </div>
      )}
    </article>
  );
}
