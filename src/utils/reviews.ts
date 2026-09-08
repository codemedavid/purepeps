/**
 * Pure customer-review logic, shared by the public Customer Reviews page, the
 * per-product review section, and the admin moderation queue.
 *
 * Side-effect free (no React, no Supabase) so the rules that decide what a
 * shopper may submit — and, more importantly, what the public is ever allowed
 * to see — can be unit tested on their own.
 *
 * The privacy rule this module enforces on the client is simple: a review row
 * carries the reviewer's real name, email, phone and order number for the admin
 * to verify against, and NONE of those may reach a public surface. The server
 * is the authoritative boundary (get_approved_reviews' RETURNS TABLE has no PII
 * column at all), and {@link toPublicReview} is the matching client-side guard
 * so an admin-shaped row can never be rendered publicly by accident.
 */

import { orderStatusLabel } from './orderTracking';

/** Moderation states a review moves through. Every review is born 'pending'. */
export const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Admin-queue labels for each moderation state. */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  hidden: 'Hidden',
};

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export const MIN_BODY_LENGTH = 10;
export const MAX_BODY_LENGTH = 2000;

/** Longest display name we store, so one reviewer cannot blow out the layout. */
export const MAX_DISPLAY_NAME_LENGTH = 40;

/**
 * Shown instead of a blank display name. Deliberately neutral: a reviewer who
 * leaves the field empty stays anonymous rather than falling back to the real
 * name on their order.
 */
export const ANONYMOUS_DISPLAY_NAME = 'Verified Customer';

/** Photos allowed per review. Caps abuse on an unauthenticated upload path. */
export const MAX_REVIEW_PHOTOS = 4;

/**
 * The notice that sits above every review surface.
 *
 * The source copy ended mid-word ("...for your individual needs. idance."), so
 * the final clause is completed here as a referral to a healthcare
 * professional. Asserted in reviews.test.ts so it cannot regress to the
 * truncated text.
 */
export const REVIEW_DISCLAIMER =
  'Results may vary from person to person. A peptide that works well for someone else may ' +
  'not have the same effect on you, because everyone has a different body, health ' +
  'condition, lifestyle, and routine. Before using or injecting any peptide, make sure it ' +
  'is appropriate and safe for your individual needs, and consult a qualified healthcare ' +
  'professional for guidance.';

/** A whole star between 1 and 5. Anything else — 4.5, NaN, '5' — is rejected. */
export function isValidRating(rating: unknown): boolean {
  return (
    typeof rating === 'number' &&
    Number.isInteger(rating) &&
    rating >= MIN_RATING &&
    rating <= MAX_RATING
  );
}

export interface BodyValidation {
  valid: boolean;
  error?: string;
}

/** Length-checks the written review against its trimmed content. */
export function validateReviewBody(body: string | null | undefined): BodyValidation {
  const trimmed = (body ?? '').trim();

  if (trimmed.length < MIN_BODY_LENGTH) {
    return { valid: false, error: `Please write at least ${MIN_BODY_LENGTH} characters.` };
  }

  if (trimmed.length > MAX_BODY_LENGTH) {
    return {
      valid: false,
      error: `Please keep your review to at most ${MAX_BODY_LENGTH} characters.`,
    };
  }

  return { valid: true };
}

/**
 * The public-facing name, exactly as the reviewer chose it — trimmed, with
 * internal whitespace collapsed and clamped to a sane length. A blank name
 * becomes {@link ANONYMOUS_DISPLAY_NAME} rather than anything derived from the
 * order, so opting out of a name never exposes the real one.
 */
export function normalizeDisplayName(name: string | null | undefined): string {
  const collapsed = (name ?? '').replace(/\s+/g, ' ').trim();
  if (collapsed === '') return ANONYMOUS_DISPLAY_NAME;
  return collapsed.slice(0, MAX_DISPLAY_NAME_LENGTH);
}

/**
 * Matches how the server normalizes an order number before comparing it
 * (`lower(btrim(...))`), so the client cannot show "verified" for input the
 * database would reject, or vice versa.
 */
export function normalizeOrderNumber(orderNumber: string | null | undefined): string {
  return (orderNumber ?? '').trim().toLowerCase();
}

/** Email counterpart of {@link normalizeOrderNumber}; mirrors the same SQL. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/**
 * Deliberately loose: the authoritative check is that the address matches the
 * one on the order, which only the server can do. This only catches obvious
 * typos before a round trip.
 */
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** The only order state a review may be written against. */
export const REVIEWABLE_ORDER_STATUS = 'delivered';

/**
 * Shown when verification finds nothing at all.
 *
 * `get_reviewable_order` returns zero rows for a wrong email AND for an order
 * that does not exist, and this message must stay identical for both — naming
 * which half was wrong would turn the form into an oracle for "has this address
 * ever ordered here".
 */
export const REVIEW_ORDER_NOT_FOUND =
  'We could not find a delivered order with those details. Please check the ' +
  'order number and the address used at checkout. Reviews open once an order ' +
  'has been delivered.';

/**
 * What to tell a customer whose review lookup did not open the form.
 *
 * The third case the generic message used to swallow is the one that actually
 * matters: the order EXISTS, the email matches, and it simply has not been
 * marked delivered yet. That is what the client hit twice on TBS-100740-4243 —
 * told to "check the order number and the address" when both were correct.
 *
 * A status is only ever passed in when the server matched the order number and
 * the email to the same row, so naming it reveals nothing to someone who does
 * not already hold both. (`get_orders_by_email` already returns order status
 * from the email alone, so this is strictly less than what is public today.)
 */
export function reviewLookupMessage(orderStatus: string | null | undefined): string {
  if (!orderStatus || orderStatus === REVIEWABLE_ORDER_STATUS) return REVIEW_ORDER_NOT_FOUND;

  const label = orderStatusLabel(orderStatus);

  if (orderStatus === 'cancelled') {
    return `We found that order, but it was cancelled (${label}), so it cannot be reviewed.`;
  }

  return (
    `We found that order — it is currently "${label}". Reviews unlock once an ` +
    'order is marked Delivered, so please try again after it arrives.'
  );
}

/** An order number and email this device already knows, for prefilling. */
export interface RememberedIdentity {
  orderNumber: string;
  email: string;
}

/**
 * The identity the shopper has already given this device, so the review form
 * does not make them retype what the site is holding two tabs away.
 *
 * The order number comes back UPPER-CASED for display — the server lower-cases
 * both sides before comparing, so the casing shown is cosmetic — while the
 * email is normalized exactly as the server will normalize it.
 */
export function rememberedReviewIdentity(
  savedOrders: readonly { orderNumber: string }[],
  checkoutEmail: string | null | undefined,
): RememberedIdentity {
  const mostRecent = savedOrders[0]?.orderNumber ?? '';
  const email = normalizeEmail(checkoutEmail);

  return {
    orderNumber: normalizeOrderNumber(mostRecent).toUpperCase(),
    email: looksLikeEmail(email) ? email : '',
  };
}

export interface ReviewSubmissionInput {
  orderNumber: string;
  email: string;
  productId: string;
  rating: number;
  body: string;
  displayName: string;
  photoUrls: readonly string[];
}

export type ReviewSubmissionErrors = Partial<
  Record<'orderNumber' | 'email' | 'productId' | 'rating' | 'body' | 'photoUrls', string>
>;

export interface ReviewSubmissionValidation {
  valid: boolean;
  errors: ReviewSubmissionErrors;
}

/**
 * Client-side pre-flight for the review form. Reports every problem at once so
 * the form can mark all offending fields in one pass instead of revealing them
 * one submit at a time.
 *
 * This is UX only. `submit_product_review` re-checks the order number, the
 * email, and that the product was actually in that order, so passing here
 * grants nothing.
 */
export function validateReviewSubmission(
  input: ReviewSubmissionInput,
): ReviewSubmissionValidation {
  const errors: ReviewSubmissionErrors = {};

  if (normalizeOrderNumber(input.orderNumber) === '') {
    errors.orderNumber = 'Enter the order number from your order.';
  }

  if (!looksLikeEmail(normalizeEmail(input.email))) {
    errors.email = 'Enter the email address used on your order.';
  }

  if (input.productId.trim() === '') {
    errors.productId = 'Choose which product you are reviewing.';
  }

  if (!isValidRating(input.rating)) {
    errors.rating = 'Choose a star rating from 1 to 5.';
  }

  const bodyCheck = validateReviewBody(input.body);
  if (!bodyCheck.valid) {
    errors.body = bodyCheck.error;
  }

  if (input.photoUrls.length > MAX_REVIEW_PHOTOS) {
    errors.photoUrls = `Please attach at most ${MAX_REVIEW_PHOTOS} photos.`;
  }

  // displayName is intentionally not required — normalizeDisplayName falls back
  // to an anonymous label, which is the privacy-preserving default.

  return { valid: Object.keys(errors).length === 0, errors };
}

export interface RatingSummary {
  /** Mean rating rounded to one decimal place; 0 when there are no reviews. */
  average: number;
  count: number;
  histogram: Record<1 | 2 | 3 | 4 | 5, number>;
}

/**
 * Aggregates star ratings for a summary bar. Ratings outside 1-5 are ignored
 * rather than counted, so a bad row can never drag the average off the scale.
 */
export function summarizeRatings(reviews: readonly { rating: number }[]): RatingSummary {
  const histogram: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let count = 0;

  for (const review of reviews) {
    if (!isValidRating(review.rating)) continue;
    histogram[review.rating as 1 | 2 | 3 | 4 | 5] += 1;
    total += review.rating;
    count += 1;
  }

  const average = count === 0 ? 0 : Math.round((total / count) * 10) / 10;

  return { average, count, histogram };
}

/** A review row as the admin sees it — public content plus reviewer identity. */
export interface AdminReview {
  id: string;
  order_id: string;
  order_number: string | null;
  product_id: string;
  product_name: string;
  variation_name: string | null;
  reviewer_name: string;
  reviewer_email: string;
  reviewer_phone: string | null;
  display_name: string;
  rating: number;
  body: string;
  media_urls: string[];
  status: ReviewStatus;
  admin_reply: string | null;
  admin_replied_at: string | null;
  moderated_at: string | null;
  moderated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Exactly what a shopper may see. Mirrors get_approved_reviews' RETURNS TABLE. */
export interface PublicReview {
  id: string;
  product_id: string;
  product_name: string;
  variation_name: string | null;
  display_name: string;
  rating: number;
  body: string;
  media_urls: string[];
  admin_reply: string | null;
  admin_replied_at: string | null;
  created_at: string;
}

/**
 * Narrows an admin-shaped row to the public one by REBUILDING it field by
 * field. Deliberately not a spread-and-delete: a column added to the table
 * later is dropped by default instead of silently reaching the public page.
 */
export function toPublicReview(review: AdminReview): PublicReview {
  return {
    id: review.id,
    product_id: review.product_id,
    product_name: review.product_name,
    variation_name: review.variation_name,
    display_name: review.display_name,
    rating: review.rating,
    body: review.body,
    media_urls: review.media_urls,
    admin_reply: review.admin_reply,
    admin_replied_at: review.admin_replied_at,
    created_at: review.created_at,
  };
}
