import { useMemo, useState } from 'react';
import { Check, EyeOff, Trash2, X } from 'lucide-react';
import { useAdminReviews } from '../../hooks/useAdminReviews';
import { getActionErrorMessage } from '../../utils/errorMessage';
import {
  ANONYMOUS_DISPLAY_NAME,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  type AdminReview,
  type ReviewStatus,
} from '../../utils/reviews';
import StarRating from './StarRating';

const DELETE_WARNING =
  'Delete this review permanently?\n\n' +
  'This cannot be undone. To take a review off the site while keeping it, use Hide instead.';

const EMPTY_BY_STATUS: Record<ReviewStatus, string> = {
  pending: 'Nothing pending — the queue is clear.',
  approved: 'No approved reviews yet.',
  rejected: 'No rejected reviews.',
  hidden: 'No hidden reviews.',
};

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface ReviewRowProps {
  review: AdminReview;
  onSetStatus: (status: ReviewStatus) => void;
  onReply: (body: string) => void;
  onDelete: () => void;
}

/**
 * One review awaiting a decision.
 *
 * The private block is labelled rather than merely styled. This card shows the
 * chosen pseudonym next to the reviewer's real name, and an admin who cannot
 * tell which half is public is one paste away from putting a customer's real
 * name into a public reply.
 */
function ReviewRow({ review, onSetStatus, onReply, onDelete }: ReviewRowProps) {
  const [draft, setDraft] = useState(review.admin_reply ?? '');
  const replyId = `review-reply-${review.id}`;
  const displayName = review.display_name?.trim() || ANONYMOUS_DISPLAY_NAME;

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarRating value={review.rating} />
        <span className="font-semibold text-gray-900">{displayName}</span>
        <span className="text-xs text-gray-400">shown publicly</span>
        <span className="ml-auto text-xs text-gray-400">{formatDay(review.created_at)}</span>
      </header>

      <p className="mt-1 text-xs text-gray-500">
        {[review.product_name, review.variation_name].filter(Boolean).join(' · ')}
      </p>

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-700">
        {review.body}
      </p>

      {review.media_urls.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {review.media_urls.map((url, index) => (
            <li key={url}>
              <img
                src={url}
                alt={`Attachment ${index + 1}`}
                width={80}
                height={80}
                className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
          Verification · not shown publicly
        </p>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-gray-700 sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-gray-500">Name</dt>
            <dd className="font-medium">{review.reviewer_name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500">Order</dt>
            <dd className="font-mono font-medium">{review.order_number ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500">Email</dt>
            <dd className="font-medium break-all">{review.reviewer_email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500">Phone</dt>
            <dd className="font-medium">{review.reviewer_phone ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4">
        <label htmlFor={replyId} className="block text-xs font-semibold text-gray-600">
          Public reply
        </label>
        <textarea
          id={replyId}
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Optional. Shown under the review once it is approved."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sakura-primary focus:outline-none focus:ring-1 focus:ring-sakura-primary"
        />
        <button
          type="button"
          onClick={() => onReply(draft)}
          className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Save reply
        </button>
      </div>

      <footer className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
        {review.status !== 'approved' && (
          <button
            type="button"
            onClick={() => onSetStatus('approved')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Check width={13} height={13} aria-hidden="true" />
            Approve
          </button>
        )}
        {review.status !== 'rejected' && (
          <button
            type="button"
            onClick={() => onSetStatus('rejected')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            <X width={13} height={13} aria-hidden="true" />
            Reject
          </button>
        )}
        {review.status !== 'hidden' && (
          <button
            type="button"
            onClick={() => onSetStatus('hidden')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            <EyeOff width={13} height={13} aria-hidden="true" />
            Hide
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
        >
          <Trash2 width={13} height={13} aria-hidden="true" />
          Delete
        </button>
      </footer>
    </article>
  );
}

/**
 * Admin → Customer Reviews.
 *
 * Opens on Pending because that is the only tab holding work; the others are
 * for looking something up after the fact. Loading, failed and empty stay
 * distinct, so "the queue is clear" is never shown for a queue that failed to
 * load — an admin who believes that stops checking.
 */
export default function ReviewsAdminManager() {
  const { reviews, loading, error, setStatus, reply, remove } = useAdminReviews();
  const [tab, setTab] = useState<ReviewStatus>('pending');
  const [actionError, setActionError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const tally = { pending: 0, approved: 0, rejected: 0, hidden: 0 } as Record<ReviewStatus, number>;
    for (const review of reviews) tally[review.status] += 1;
    return tally;
  }, [reviews]);

  const visible = useMemo(
    () => reviews.filter((review) => review.status === tab),
    [reviews, tab],
  );

  const perform = async (action: () => Promise<void>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(getActionErrorMessage(err, 'That change could not be saved.'));
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm(DELETE_WARNING)) return;
    void perform(() => remove(id));
  };

  return (
    <section>
      <div role="tablist" aria-label="Review status" className="flex flex-wrap gap-2">
        {REVIEW_STATUSES.map((status) => {
          const active = tab === status;
          return (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(status)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-sakura-primary text-white'
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {REVIEW_STATUS_LABELS[status]}
              <span className={active ? 'ml-1.5 opacity-80' : 'ml-1.5 text-gray-400'}>
                {counts[status]}
              </span>
            </button>
          );
        })}
      </div>

      {actionError && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </p>
      )}

      <div className="mt-5 space-y-4">
        {loading && (
          <p role="status" className="py-10 text-center text-sm text-gray-500">
            Loading reviews…
          </p>
        )}

        {!loading && error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {!loading && !error && visible.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-500">{EMPTY_BY_STATUS[tab]}</p>
        )}

        {!loading &&
          !error &&
          visible.map((review) => (
            <ReviewRow
              key={review.id}
              review={review}
              onSetStatus={(status) => void perform(() => setStatus(review.id, status))}
              onReply={(body) => void perform(() => reply(review.id, body))}
              onDelete={() => handleDelete(review.id)}
            />
          ))}
      </div>
    </section>
  );
}
