import { useMemo, useState } from 'react';
import { MessageSquareQuote } from 'lucide-react';
import { useProductReviews } from '../../hooks/useProductReviews';
import { REVIEW_DISCLAIMER } from '../../utils/reviews';
import { BOTTOM_NAV_CLEARANCE } from '../../utils/storefrontNavigation';
import ReviewCard from './ReviewCard';
import ReviewSummary from './ReviewSummary';

/** Sentinel for the unfiltered option, so "" never doubles as a product name. */
const ALL_PRODUCTS = '__all__';

/**
 * The public Customer Reviews page.
 *
 * Shows only what `get_approved_reviews` returns, which is only approved rows
 * and never reviewer identity — moderation and privacy both live behind that
 * RPC rather than in this component.
 *
 * Loading, failed and empty are kept as three distinct states. Collapsing the
 * first two into the third would tell a shopper the shop has no reviews when
 * the truth is that we could not read them.
 */
export default function ReviewsPage() {
  const { reviews, loading, error } = useProductReviews();
  const [productFilter, setProductFilter] = useState<string>(ALL_PRODUCTS);

  // Distinct product names, so a well-reviewed product appears once rather than
  // once per review.
  const productNames = useMemo(
    () => [...new Set(reviews.map((review) => review.product_name))].sort(),
    [reviews],
  );

  const visible = useMemo(
    () =>
      productFilter === ALL_PRODUCTS
        ? reviews
        : reviews.filter((review) => review.product_name === productFilter),
    [reviews, productFilter],
  );

  return (
    <main className={`min-h-screen bg-sakura-canvas ${BOTTOM_NAV_CLEARANCE}`}>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-sakura-blush px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sakura-deep">
            <MessageSquareQuote width={13} height={13} aria-hidden="true" />
            Verified buyers only
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-sakura-ink sm:text-4xl">
            Customer Reviews
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-charcoal-500">
            Every review below is tied to a delivered order. Reviewers choose the name shown —
            their real name and contact details are never published.
          </p>
        </header>

        {/* Held back until the read settles: ReviewSummary's empty state says
            "No reviews yet", which is a claim about the shop that must not be
            made while loading or after a failed read. */}
        {!loading && !error && (
          <div className="mt-10">
            <ReviewSummary reviews={visible} />
          </div>
        )}

        {!loading && !error && productNames.length > 1 && (
          <div className="mt-6 flex items-center justify-end gap-2">
            <label htmlFor="review-product-filter" className="text-xs font-semibold text-charcoal-500">
              Product
            </label>
            <select
              id="review-product-filter"
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
              className="rounded-lg border border-sakura-edge bg-white px-3 py-1.5 text-sm text-charcoal-700 focus:border-sakura-primary focus:outline-none focus:ring-1 focus:ring-sakura-primary"
            >
              <option value={ALL_PRODUCTS}>All products</option>
              {productNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        <section className="mt-6 space-y-4" aria-label="Customer reviews">
          {loading && (
            <p role="status" className="py-10 text-center text-sm text-charcoal-500">
              Loading reviews…
            </p>
          )}

          {!loading && error && (
            <p
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          {!loading &&
            !error &&
            visible.map((review) => <ReviewCard key={review.id} review={review} />)}
        </section>

        <aside className="mt-10 rounded-2xl border border-sakura-edge bg-sakura-blush-soft px-5 py-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sakura-deep">
            Please read
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-charcoal-600">{REVIEW_DISCLAIMER}</p>
        </aside>
      </div>
    </main>
  );
}
