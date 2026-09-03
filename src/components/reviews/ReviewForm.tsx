import { useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, X } from 'lucide-react';
import { useReviewSubmission, type ReviewableProduct } from '../../hooks/useReviewSubmission';
import { useImageUpload } from '../../hooks/useImageUpload';
import {
  MAX_BODY_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_REVIEW_PHOTOS,
} from '../../utils/reviews';
import StarRating from './StarRating';

const FIELD_CLASS =
  'mt-1 w-full rounded-lg border border-sakura-edge bg-white px-3 py-2 text-sm text-charcoal-700 ' +
  'focus:border-sakura-primary focus:outline-none focus:ring-1 focus:ring-sakura-primary';

const LABEL_CLASS = 'block text-xs font-semibold text-charcoal-600';

const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-sakura-primary px-4 py-2 ' +
  'text-sm font-semibold text-white transition-colors hover:bg-sakura-deep ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

function productLabel(item: ReviewableProduct): string {
  const name = [item.product_name, item.variation_name].filter(Boolean).join(' · ');
  return item.already_reviewed ? `${name} — already reviewed` : name;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-red-600">{message}</p>;
}

/**
 * The customer-facing review form.
 *
 * Two steps, deliberately. The rating and body are not rendered until an order
 * has been proven — showing them first invites a customer to write a full
 * review and only then discover they cannot post it.
 *
 * Nothing here is a security boundary. `submit_product_review` re-derives the
 * order from the raw order number and email, re-checks that the product was in
 * it, and hard-codes `pending`, so every rule below is a courtesy that saves a
 * round trip rather than a gate.
 */
export default function ReviewForm() {
  const {
    products,
    verified,
    submitted,
    looking,
    submitting,
    mediaEnabled,
    error,
    fieldErrors,
    lookup,
    submit,
    reset,
  } = useReviewSubmission();
  const { uploadImage, uploading } = useImageUpload('review-photos');

  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [productId, setProductId] = useState('');
  const [rating, setRating] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [body, setBody] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // The first product that can still be reviewed, so the select is never
  // pre-set to a disabled option.
  const firstAvailable = products.find((item) => !item.already_reviewed)?.product_id ?? '';
  const chosenProduct = productId || firstAvailable;

  const handleLookup = (event: React.FormEvent) => {
    event.preventDefault();
    void lookup(orderNumber, email);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void submit({ productId: chosenProduct, rating, body, displayName, photoUrls });
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    try {
      const url = await uploadImage(file);
      if (url) setPhotoUrls((current) => [...current, url].slice(0, MAX_REVIEW_PHOTOS));
    } catch {
      setPhotoError('That photo could not be uploaded. Please try again.');
    }
  };

  const startAnother = () => {
    setProductId('');
    setRating(0);
    setDisplayName('');
    setBody('');
    setPhotoUrls([]);
    setPhotoError(null);
    reset();
  };

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" aria-hidden="true" />
        <h3 className="mt-3 font-semibold text-emerald-900">Thank you for your review</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-emerald-800">
          It has been sent for approval and will appear on this page once our team has checked it.
        </p>
        <button type="button" onClick={startAnother} className={`${PRIMARY_BUTTON} mt-5`}>
          Write another review
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sakura-edge bg-white p-6">
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {!verified ? (
        <form onSubmit={handleLookup} noValidate>
          <h3 className="font-semibold text-sakura-ink">Write a review</h3>
          <p className="mt-1 text-sm text-charcoal-500">
            Reviews are open to verified buyers. Enter your order details to get started.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="review-order-number" className={LABEL_CLASS}>
                Order number
              </label>
              <input
                id="review-order-number"
                type="text"
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                placeholder="PP-1042"
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label htmlFor="review-email" className={LABEL_CLASS}>
                Email address
              </label>
              <input
                id="review-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className={FIELD_CLASS}
              />
              <p className="mt-1 text-[11px] text-charcoal-400">
                The address used at checkout. Never shown publicly.
              </p>
            </div>
          </div>

          <button type="submit" disabled={looking} className={`${PRIMARY_BUTTON} mt-5`}>
            {looking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {looking ? 'Finding your order…' : 'Find my order'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <h3 className="font-semibold text-sakura-ink">Write a review</h3>
          <p className="mt-1 text-sm text-charcoal-500">
            Order found. Choose what you would like to review.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="review-product" className={LABEL_CLASS}>
                Product
              </label>
              <select
                id="review-product"
                value={chosenProduct}
                onChange={(event) => setProductId(event.target.value)}
                className={FIELD_CLASS}
              >
                {products.map((item) => (
                  <option
                    key={item.product_id}
                    value={item.product_id}
                    disabled={item.already_reviewed}
                  >
                    {productLabel(item)}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.productId} />
            </div>

            <div>
              <span className={LABEL_CLASS}>Rating</span>
              <div className="mt-1">
                <StarRating value={rating} onChange={setRating} size={26} />
              </div>
              <FieldError message={fieldErrors.rating} />
            </div>

            <div>
              <label htmlFor="review-display-name" className={LABEL_CLASS}>
                Display name
              </label>
              <input
                id="review-display-name"
                type="text"
                value={displayName}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Any name you like"
                className={FIELD_CLASS}
              />
              <p className="mt-1 text-[11px] text-charcoal-400">
                This is the only name shown on your review. Your real name, email and phone number
                are never shown publicly. Leave it blank to appear as “Verified Customer”.
              </p>
            </div>

            <div>
              <label htmlFor="review-body" className={LABEL_CLASS}>
                Your review
              </label>
              <textarea
                id="review-body"
                rows={5}
                value={body}
                maxLength={MAX_BODY_LENGTH}
                onChange={(event) => setBody(event.target.value)}
                placeholder="How did it go? What did you notice?"
                className={FIELD_CLASS}
              />
              <FieldError message={fieldErrors.body} />
            </div>

            {mediaEnabled && (
              <div>
                <label htmlFor="review-photos" className={LABEL_CLASS}>
                  Photos (optional, up to {MAX_REVIEW_PHOTOS})
                </label>
                <input
                  id="review-photos"
                  type="file"
                  accept="image/*"
                  disabled={uploading || photoUrls.length >= MAX_REVIEW_PHOTOS}
                  onChange={(event) => {
                    void handleUpload(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                  className="mt-1 block w-full text-xs text-charcoal-500 file:mr-3 file:rounded-lg file:border-0 file:bg-sakura-blush file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-sakura-deep"
                />
                {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
                <FieldError message={fieldErrors.photoUrls} />

                {photoUrls.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {photoUrls.map((url) => (
                      <li key={url} className="relative">
                        <img
                          src={url}
                          alt="Attached to your review"
                          width={72}
                          height={72}
                          className="h-[72px] w-[72px] rounded-lg border border-sakura-edge object-cover"
                        />
                        <button
                          type="button"
                          aria-label="Remove photo"
                          onClick={() =>
                            setPhotoUrls((current) => current.filter((kept) => kept !== url))
                          }
                          className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 shadow ring-1 ring-sakura-edge"
                        >
                          <X className="h-3 w-3 text-charcoal-600" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={submitting || uploading} className={PRIMARY_BUTTON}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? 'Submitting…' : 'Submit review'}
            </button>
            {mediaEnabled && uploading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-charcoal-500">
                <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                Uploading photo…
              </span>
            )}
          </div>

          <p className="mt-3 text-[11px] text-charcoal-400">
            Reviews are checked by our team before they appear on the site.
          </p>
        </form>
      )}
    </div>
  );
}
