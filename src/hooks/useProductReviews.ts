import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getActionErrorMessage } from '../utils/errorMessage';
import type { PublicReview } from '../utils/reviews';

export interface ProductReviewsState {
  /** Approved reviews, newest first. Never contains reviewer identity. */
  reviews: PublicReview[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Reads published reviews for the storefront.
 *
 * Always through `get_approved_reviews`, never `.from('product_reviews')`. That
 * is not a style preference: anon holds no grant on the table, and the RPC's
 * RETURNS TABLE is what physically excludes reviewer_name / email / phone /
 * order_number. Reading the table would fail for shoppers and, if it ever
 * stopped failing, would be the leak.
 *
 * A failed read empties the list rather than keeping the previous one. Stale
 * reviews under an error message read as "this is all of them", which is
 * precisely what is unknown at that moment.
 *
 * @param productId Narrow to one product, or omit for the whole review page.
 */
export function useProductReviews(productId?: string | null): ProductReviewsState {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_approved_reviews', {
        p_product_id: productId ?? null,
      });
      if (rpcError) throw rpcError;

      setReviews((data ?? []) as PublicReview[]);
    } catch (err) {
      setError(getActionErrorMessage(err, 'Could not load reviews right now.'));
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  return useMemo(
    () => ({ reviews, loading, error, refresh: fetchReviews }),
    [reviews, loading, error, fetchReviews],
  );
}

export default useProductReviews;
