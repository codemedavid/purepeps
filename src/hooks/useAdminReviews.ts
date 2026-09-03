import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getActionErrorMessage } from '../utils/errorMessage';
import type { AdminReview, ReviewStatus } from '../utils/reviews';

export interface AdminReviewsState {
  /** Every review, newest first, INCLUDING reviewer identity. */
  reviews: AdminReview[];
  loading: boolean;
  error: string | null;
  setStatus: (id: string, status: ReviewStatus) => Promise<void>;
  reply: (id: string, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Best-effort admin identity for the moderation stamp.
 *
 * Degrades to null rather than throwing: being unable to name the admin is not
 * a reason to leave a review stuck in the queue.
 */
async function currentAdminId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * The admin moderation queue.
 *
 * Reads `product_reviews` DIRECTLY, unlike the public `useProductReviews`.
 * That asymmetry is the point: RLS confines the table to `public.is_admin()`,
 * and this is the one surface where reviewer_name / email / phone / order_number
 * are meant to be visible — verifying the purchase behind a review is exactly
 * what an admin is doing here.
 *
 * Every moderating write stamps `moderated_at` and `moderated_by` alongside the
 * status. They are set in one place rather than at each call site so a new
 * action cannot silently ship without them; the table has no trigger to fall
 * back on, and `updated_at` is likewise maintained here.
 */
export function useAdminReviews(): AdminReviewsState {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: readError } = await supabase
        .from('product_reviews')
        .select('*')
        .order('created_at', { ascending: false });

      if (readError) throw readError;
      setReviews((data ?? []) as AdminReview[]);
    } catch (err) {
      setError(getActionErrorMessage(err, 'Could not load the review queue.'));
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  /** Applies one patch to one review, then reloads so the queue cannot drift. */
  const patch = useCallback(
    async (id: string, changes: Record<string, unknown>) => {
      const { error: writeError } = await supabase
        .from('product_reviews')
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (writeError) throw new Error(writeError.message);
      await fetchReviews();
    },
    [fetchReviews],
  );

  const setStatus = useCallback(
    async (id: string, status: ReviewStatus) => {
      await patch(id, {
        status,
        moderated_at: new Date().toISOString(),
        moderated_by: await currentAdminId(),
      });
    },
    [patch],
  );

  const reply = useCallback(
    async (id: string, body: string) => {
      const trimmed = body.trim();
      // Deliberately no `status` here: answering a pending review must not
      // publish it. Clearing stores null, not '', so the public card renders no
      // reply block rather than an empty one.
      await patch(id, {
        admin_reply: trimmed || null,
        admin_replied_at: trimmed ? new Date().toISOString() : null,
      });
    },
    [patch],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error: deleteError } = await supabase
        .from('product_reviews')
        .delete()
        .eq('id', id);

      if (deleteError) throw new Error(deleteError.message);
      await fetchReviews();
    },
    [fetchReviews],
  );

  return useMemo(
    () => ({ reviews, loading, error, setStatus, reply, remove, refresh: fetchReviews }),
    [reviews, loading, error, setStatus, reply, remove, fetchReviews],
  );
}

export default useAdminReviews;
