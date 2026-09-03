import { Star } from 'lucide-react';
import { MAX_RATING } from '../../utils/reviews';

const STARS = Array.from({ length: MAX_RATING }, (_, index) => index + 1);

/** "1 star", "4 stars" — the singular matters in a screen reader. */
function starLabel(count: number): string {
  return `${count} ${count === 1 ? 'star' : 'stars'}`;
}

interface StarRatingProps {
  /** The score, 1-5. Anything outside that simply fills no stars. */
  value: number;
  /** Supplying this turns the component into a radiogroup input. */
  onChange?: (rating: number) => void;
  /** Star size in px. Cards want small, the form wants large. */
  size?: number;
}

/**
 * A five-star score, in one of two modes.
 *
 * DISPLAY (no onChange) is inert text-plus-shapes with the score in an
 * aria-label, because a row of filled shapes is invisible to a screen reader
 * and to anyone who cannot distinguish the fill colour.
 *
 * INPUT (with onChange) is a real radiogroup of five radios rather than five
 * clickable icons. Native radios give arrow-key traversal, focus and checked
 * state for free — the parts a hand-rolled star picker usually drops.
 *
 * Both modes always draw all five stars; only the fill changes. Drawing three
 * stars for a three-star review reads as "3 out of 3".
 */
export default function StarRating({ value, onChange, size = 16 }: StarRatingProps) {
  const filledThrough = Math.round(value);

  if (!onChange) {
    return (
      <span
        className="inline-flex items-center gap-0.5 align-middle"
        aria-label={`Rated ${value} out of ${MAX_RATING} stars`}
        role="img"
      >
        {STARS.map((star) => (
          <Star
            key={star}
            width={size}
            height={size}
            aria-hidden="true"
            className={
              star <= filledThrough
                ? 'fill-sakura-primary text-sakura-primary'
                : 'fill-transparent text-sakura-edge'
            }
          />
        ))}
      </span>
    );
  }

  return (
    <span role="radiogroup" aria-label="Rating" className="inline-flex items-center gap-1">
      {STARS.map((star) => {
        const label = starLabel(star);
        return (
          <label
            key={star}
            title={label}
            className="cursor-pointer p-0.5 rounded-full focus-within:ring-2 focus-within:ring-sakura-primary focus-within:ring-offset-1"
          >
            <input
              type="radio"
              name="star-rating"
              className="sr-only"
              aria-label={label}
              checked={value === star}
              onChange={() => onChange(star)}
            />
            <Star
              width={size}
              height={size}
              aria-hidden="true"
              className={`transition-colors ${
                star <= value
                  ? 'fill-sakura-primary text-sakura-primary'
                  : 'fill-transparent text-sakura-edge hover:text-sakura-light'
              }`}
            />
          </label>
        );
      })}
    </span>
  );
}
