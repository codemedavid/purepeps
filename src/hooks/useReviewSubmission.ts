import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getActionErrorMessage } from '../utils/errorMessage';
import {
  parseFeatureFlagValue,
  REVIEW_MEDIA_SETTING_KEY,
  type FeatureFlagRow,
} from '../utils/featureFlags';
import {
  normalizeEmail,
  normalizeOrderNumber,
  REVIEWABLE_ORDER_STATUS,
  reviewLookupMessage,
  validateReviewSubmission,
  type ReviewSubmissionErrors,
} from '../utils/reviews';

/** One line item of a proven order, as `get_reviewable_order` returns it. */
export interface ReviewableProduct {
  product_id: string;
  product_name: string;
  variation_name: string | null;
  /** True when this order already has a review for this product. */
  already_reviewed: boolean;
}

export interface ReviewDraft {
  productId: string;
  rating: number;
  body: string;
  displayName: string;
  photoUrls: readonly string[];
}

/** One row of `get_order_review_status` — the status of a matched order. */
interface OrderStatusRow {
  order_status: string | null;
}

export interface ReviewSubmissionState {
  /** Products on the proven order. Empty until a successful lookup. */
  products: ReviewableProduct[];
  /** True once an order number + email pair has been accepted. */
  verified: boolean;
  /**
   * The matched order's status, or null when nothing matched. Lets the form
   * say WHY a real order did not open — rather than implying it was not found.
   */
  orderStatus: string | null;
  /** True once a review has been accepted by the database. */
  submitted: boolean;
  looking: boolean;
  submitting: boolean;
  /** True until the photo switch has been read once. */
  loadingSettings: boolean;
  /** Whether reviewers may attach photos. Fails open. */
  mediaEnabled: boolean;
  error: string | null;
  fieldErrors: ReviewSubmissionErrors;
  lookup: (orderNumber: string, email: string) => Promise<void>;
  submit: (draft: ReviewDraft) => Promise<void>;
  reset: () => void;
}

/**
 * The matched order's status, or null when nothing matched.
 *
 * A failure here must never be louder than the answer it was refining: the
 * delivered lookup has already succeeded and returned nothing, so the worst
 * this can do is fall back to the generic message.
 */
async function fetchOrderStatus(
  orderNumber: string,
  email: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('get_order_review_status', {
      p_order_number: orderNumber,
      p_email: email,
    });
    if (error) return null;

    const rows = (data ?? []) as OrderStatusRow[];
    return rows[0]?.order_status ?? null;
  } catch {
    return null;
  }
}

/**
 * Drives the two steps of writing a review: prove the purchase, then post it.
 *
 * The proven order number and email are held here and replayed on submit.
 * `submit_product_review` deliberately takes no order id — it re-derives the
 * order from those raw values every time — so this hook must keep them rather
 * than caching an id the server would not accept.
 *
 * Client validation here is a courtesy, not a gate. The RPC re-checks the
 * order, the email, and that the product was actually in that order, so
 * passing these checks grants nothing.
 */
export function useReviewSubmission(): ReviewSubmissionState {
  const [products, setProducts] = useState<ReviewableProduct[]>([]);
  const [proven, setProven] = useState<{ orderNumber: string; email: string } | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [looking, setLooking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [mediaEnabled, setMediaEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ReviewSubmissionErrors>({});

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const { data, error: readError } = await supabase
          .from('site_settings')
          .select('id,value')
          .in('id', [REVIEW_MEDIA_SETTING_KEY]);

        if (readError) throw readError;
        if (!active) return;

        const row = ((data ?? []) as FeatureFlagRow[]).find(
          (candidate) => candidate.id === REVIEW_MEDIA_SETTING_KEY,
        );
        // Fail open, exactly as featureFlags does: an un-seeded database must
        // not silently strip a reviewer's attachments.
        setMediaEnabled(parseFeatureFlagValue(row?.value));
      } catch {
        if (active) setMediaEnabled(true);
      } finally {
        if (active) setLoadingSettings(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const lookup = useCallback(async (orderNumber: string, email: string) => {
    const normalizedOrder = normalizeOrderNumber(orderNumber);
    const normalizedEmail = normalizeEmail(email);

    setError(null);
    setFieldErrors({});
    setOrderStatus(null);

    if (!normalizedOrder || !normalizedEmail) {
      setError('Enter both the order number and the email address used at checkout.');
      return;
    }

    setLooking(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_reviewable_order', {
        p_order_number: normalizedOrder,
        p_email: normalizedEmail,
      });
      if (rpcError) throw rpcError;

      const rows = (data ?? []) as ReviewableProduct[];
      if (rows.length === 0) {
        setProducts([]);
        setProven(null);

        // Zero rows covers three cases and only one of them is actionable: the
        // order is real, the email matched, and it is simply not delivered yet.
        // Ask the status-only RPC to separate that case out. It answers only
        // when BOTH values match the same order, so the wrong-email and
        // unknown-order cases still come back indistinguishable.
        const status = await fetchOrderStatus(normalizedOrder, normalizedEmail);
        setOrderStatus(status);
        setError(reviewLookupMessage(status));
        return;
      }

      setProducts(rows);
      setProven({ orderNumber: normalizedOrder, email: normalizedEmail });
      setOrderStatus(REVIEWABLE_ORDER_STATUS);
    } catch (err) {
      // Distinct from the not-found message on purpose: telling someone their
      // order does not exist when the lookup merely failed sends them away for
      // good.
      setError(getActionErrorMessage(err, 'We could not check that order right now.'));
      setProducts([]);
      setProven(null);
      setOrderStatus(null);
    } finally {
      setLooking(false);
    }
  }, []);

  const submit = useCallback(
    async (draft: ReviewDraft) => {
      if (!proven) return;

      // Photos are dropped here as well as server-side. submit_product_review
      // blanks media_urls when the switch is off, so sending them would only
      // publish files the database is about to discard.
      const photoUrls = mediaEnabled ? [...draft.photoUrls] : [];

      const validation = validateReviewSubmission({
        orderNumber: proven.orderNumber,
        email: proven.email,
        productId: draft.productId,
        rating: draft.rating,
        body: draft.body,
        displayName: draft.displayName,
        photoUrls,
      });

      setFieldErrors(validation.errors);
      setError(null);
      if (!validation.valid) return;

      setSubmitting(true);
      try {
        const { error: rpcError } = await supabase.rpc('submit_product_review', {
          p_order_number: proven.orderNumber,
          p_email: proven.email,
          p_product_id: draft.productId,
          p_rating: draft.rating,
          p_body: draft.body,
          p_display_name: draft.displayName,
          p_media_urls: photoUrls,
        });
        if (rpcError) throw rpcError;

        setSubmitted(true);
      } catch (err) {
        // The RPC raises reviewer-facing wording of its own ("Please choose a
        // star rating from 1 to 5"), which beats anything invented here.
        setError(getActionErrorMessage(err, 'That review could not be submitted.'));
      } finally {
        setSubmitting(false);
      }
    },
    [proven, mediaEnabled],
  );

  const reset = useCallback(() => {
    setProducts([]);
    setProven(null);
    setSubmitted(false);
    setError(null);
    setFieldErrors({});
    setOrderStatus(null);
  }, []);

  return useMemo(
    () => ({
      products,
      verified: proven !== null,
      orderStatus,
      submitted,
      looking,
      submitting,
      loadingSettings,
      mediaEnabled,
      error,
      fieldErrors,
      lookup,
      submit,
      reset,
    }),
    [
      products,
      proven,
      orderStatus,
      submitted,
      looking,
      submitting,
      loadingSettings,
      mediaEnabled,
      error,
      fieldErrors,
      lookup,
      submit,
      reset,
    ],
  );
}

export default useReviewSubmission;
