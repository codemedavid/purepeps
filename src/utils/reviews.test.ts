import { describe, expect, it } from 'vitest';
import {
  REVIEW_ORDER_NOT_FOUND,
  rememberedReviewIdentity,
  reviewLookupMessage,
  MAX_BODY_LENGTH,
  MAX_RATING,
  MAX_REVIEW_PHOTOS,
  MIN_BODY_LENGTH,
  MIN_RATING,
  REVIEW_DISCLAIMER,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  isValidRating,
  normalizeDisplayName,
  normalizeEmail,
  normalizeOrderNumber,
  summarizeRatings,
  toPublicReview,
  validateReviewBody,
  validateReviewSubmission,
} from './reviews';

describe('rating validation', () => {
  it('accepts every whole star from 1 to 5', () => {
    for (let rating = MIN_RATING; rating <= MAX_RATING; rating += 1) {
      expect(isValidRating(rating)).toBe(true);
    }
  });

  it('rejects ratings outside the 1-5 range', () => {
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(-1)).toBe(false);
  });

  it('rejects fractional and non-numeric ratings', () => {
    expect(isValidRating(4.5)).toBe(false);
    expect(isValidRating(Number.NaN)).toBe(false);
    expect(isValidRating(null)).toBe(false);
    expect(isValidRating(undefined)).toBe(false);
    expect(isValidRating('5' as unknown as number)).toBe(false);
  });
});

describe('review body validation', () => {
  it('accepts a body within the allowed length', () => {
    expect(validateReviewBody('Great product, arrived well packed.')).toEqual({ valid: true });
  });

  it('rejects a body shorter than the minimum after trimming', () => {
    const result = validateReviewBody(`   ${'a'.repeat(MIN_BODY_LENGTH - 1)}   `);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least/i);
  });

  it('rejects an empty or whitespace-only body', () => {
    expect(validateReviewBody('').valid).toBe(false);
    expect(validateReviewBody('      ').valid).toBe(false);
  });

  it('rejects a body longer than the maximum', () => {
    const result = validateReviewBody('a'.repeat(MAX_BODY_LENGTH + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/2000|less|most/i);
  });

  it('rejects null and undefined bodies', () => {
    expect(validateReviewBody(null).valid).toBe(false);
    expect(validateReviewBody(undefined).valid).toBe(false);
  });
});

describe('display name normalization', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeDisplayName('   Jane D.   ')).toBe('Jane D.');
  });

  it('collapses runs of internal whitespace into a single space', () => {
    expect(normalizeDisplayName('Jane\t\n   D.')).toBe('Jane D.');
  });

  it('falls back to a neutral label when the name is blank', () => {
    expect(normalizeDisplayName('')).toBe('Verified Customer');
    expect(normalizeDisplayName('    ')).toBe('Verified Customer');
    expect(normalizeDisplayName(null)).toBe('Verified Customer');
    expect(normalizeDisplayName(undefined)).toBe('Verified Customer');
  });

  it('clamps an overlong name to 40 characters', () => {
    expect(normalizeDisplayName('x'.repeat(80))).toHaveLength(40);
  });

  it('keeps a pseudonym exactly as typed', () => {
    expect(normalizeDisplayName('peptide_fan_99')).toBe('peptide_fan_99');
  });
});

describe('order number and email normalization', () => {
  it('normalizes an order number the way the server does', () => {
    expect(normalizeOrderNumber('  pp-1024  ')).toBe('pp-1024');
    expect(normalizeOrderNumber('PP-1024')).toBe('pp-1024');
  });

  it('normalizes an email the way the server does', () => {
    expect(normalizeEmail('  Jane@Example.COM ')).toBe('jane@example.com');
  });

  it('returns an empty string for missing input', () => {
    expect(normalizeOrderNumber(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});

describe('submission validation', () => {
  const validInput = {
    orderNumber: 'PP-1024',
    email: 'jane@example.com',
    productId: 'prod-1',
    rating: 5,
    body: 'Arrived quickly and the vial was properly sealed.',
    displayName: 'Jane D.',
    photoUrls: [] as string[],
  };

  it('accepts a complete, valid submission', () => {
    expect(validateReviewSubmission(validInput)).toEqual({ valid: true, errors: {} });
  });

  it('requires an order number', () => {
    const result = validateReviewSubmission({ ...validInput, orderNumber: '  ' });
    expect(result.valid).toBe(false);
    expect(result.errors.orderNumber).toMatch(/order number/i);
  });

  it('requires a plausible email address', () => {
    const result = validateReviewSubmission({ ...validInput, email: 'not-an-email' });
    expect(result.valid).toBe(false);
    expect(result.errors.email).toMatch(/email/i);
  });

  it('requires a product selection', () => {
    const result = validateReviewSubmission({ ...validInput, productId: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.productId).toMatch(/product/i);
  });

  it('requires a valid star rating', () => {
    const result = validateReviewSubmission({ ...validInput, rating: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.rating).toMatch(/rating|star/i);
  });

  it('surfaces the body error from validateReviewBody', () => {
    const result = validateReviewSubmission({ ...validInput, body: 'short' });
    expect(result.valid).toBe(false);
    expect(result.errors.body).toBeTruthy();
  });

  it('rejects more photos than the per-review cap', () => {
    const tooMany = Array.from({ length: MAX_REVIEW_PHOTOS + 1 }, (_, i) => `https://img/${i}.jpg`);
    const result = validateReviewSubmission({ ...validInput, photoUrls: tooMany });
    expect(result.valid).toBe(false);
    expect(result.errors.photoUrls).toMatch(/photo/i);
  });

  it('accepts exactly the maximum number of photos', () => {
    const atCap = Array.from({ length: MAX_REVIEW_PHOTOS }, (_, i) => `https://img/${i}.jpg`);
    expect(validateReviewSubmission({ ...validInput, photoUrls: atCap }).valid).toBe(true);
  });

  it('does not require a display name, since it falls back to a neutral label', () => {
    expect(validateReviewSubmission({ ...validInput, displayName: '' }).valid).toBe(true);
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const result = validateReviewSubmission({
      ...validInput,
      orderNumber: '',
      email: 'nope',
      rating: 9,
    });
    expect(Object.keys(result.errors).sort()).toEqual(['email', 'orderNumber', 'rating']);
  });
});

describe('rating summary', () => {
  it('reports zero average and count for no reviews', () => {
    expect(summarizeRatings([])).toEqual({
      average: 0,
      count: 0,
      histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it('averages ratings and rounds to one decimal place', () => {
    const summary = summarizeRatings([{ rating: 5 }, { rating: 4 }, { rating: 4 }]);
    expect(summary.average).toBe(4.3);
    expect(summary.count).toBe(3);
  });

  it('counts each star level into the histogram', () => {
    const summary = summarizeRatings([{ rating: 5 }, { rating: 5 }, { rating: 3 }, { rating: 1 }]);
    expect(summary.histogram).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0, 5: 2 });
  });

  it('ignores out-of-range ratings instead of skewing the average', () => {
    const summary = summarizeRatings([{ rating: 5 }, { rating: 99 }, { rating: 0 }]);
    expect(summary.count).toBe(1);
    expect(summary.average).toBe(5);
  });
});

describe('public projection', () => {
  const adminRow = {
    id: 'rev-1',
    order_id: 'order-1',
    order_number: 'PP-1024',
    product_id: 'prod-1',
    product_name: 'BPC-157',
    variation_name: '10mg',
    reviewer_name: 'Jane Dela Cruz',
    reviewer_email: 'jane@example.com',
    reviewer_phone: '09171234567',
    display_name: 'Jane D.',
    rating: 5,
    body: 'Arrived quickly and the vial was properly sealed.',
    media_urls: ['https://img/1.jpg'],
    status: 'approved' as const,
    admin_reply: 'Thank you!',
    admin_replied_at: '2026-08-20T00:00:00Z',
    moderated_at: '2026-08-20T00:00:00Z',
    moderated_by: 'admin-1',
    created_at: '2026-08-19T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
  };

  it('keeps the fields a shopper is meant to see', () => {
    const publicReview = toPublicReview(adminRow);
    expect(publicReview.display_name).toBe('Jane D.');
    expect(publicReview.rating).toBe(5);
    expect(publicReview.body).toBe(adminRow.body);
    expect(publicReview.product_name).toBe('BPC-157');
    expect(publicReview.media_urls).toEqual(['https://img/1.jpg']);
    expect(publicReview.admin_reply).toBe('Thank you!');
    expect(publicReview.created_at).toBe('2026-08-19T00:00:00Z');
  });

  it('drops every personally identifying field', () => {
    const publicReview = toPublicReview(adminRow) as unknown as Record<string, unknown>;
    for (const field of [
      'reviewer_name',
      'reviewer_email',
      'reviewer_phone',
      'order_id',
      'order_number',
      'moderated_by',
    ]) {
      expect(publicReview).not.toHaveProperty(field);
    }
  });

  it('never leaks PII through JSON serialization', () => {
    const serialized = JSON.stringify(toPublicReview(adminRow));
    expect(serialized).not.toContain('Jane Dela Cruz');
    expect(serialized).not.toContain('jane@example.com');
    expect(serialized).not.toContain('09171234567');
    expect(serialized).not.toContain('PP-1024');
  });
});

describe('review statuses and disclaimer', () => {
  it('defines exactly the four moderation states', () => {
    expect([...REVIEW_STATUSES].sort()).toEqual(['approved', 'hidden', 'pending', 'rejected']);
  });

  it('labels every status for the admin queue', () => {
    for (const status of REVIEW_STATUSES) {
      expect(REVIEW_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('states that results vary and to check suitability before use', () => {
    expect(REVIEW_DISCLAIMER).toMatch(/results may vary/i);
    expect(REVIEW_DISCLAIMER).toMatch(/different body, health condition, lifestyle, and routine/i);
    expect(REVIEW_DISCLAIMER).toMatch(/before using or injecting any peptide/i);
    expect(REVIEW_DISCLAIMER).toMatch(/healthcare professional/i);
  });

  it('is a finished sentence, not the truncated source copy', () => {
    // \b anchors this to the truncated standalone word from the source copy;
    // a bare /idance\./ would also match the legitimate "guidance." ending.
    expect(REVIEW_DISCLAIMER).not.toMatch(/\bidance\./);
    expect(REVIEW_DISCLAIMER.trim()).toMatch(/\.$/);
  });
});

/**
 * The client's report: order TBS-100740-4243 with the right checkout email
 * came back "We could not find a delivered order…" twice. The order existed
 * and the email matched — it simply had not been marked delivered yet, and the
 * one-size-fits-all message gave them no way to know that.
 *
 * The generic message still stands for a genuine miss: an order that does not
 * exist and an order under someone else's email must stay indistinguishable.
 */
describe('reviewLookupMessage', () => {
  it('stays generic when nothing matched at all', () => {
    const message = reviewLookupMessage(null);

    expect(message).toBe(REVIEW_ORDER_NOT_FOUND);
    expect(message).toMatch(/could not find a delivered order/i);
  });

  it('treats an unknown status the same as no match', () => {
    expect(reviewLookupMessage('')).toBe(REVIEW_ORDER_NOT_FOUND);
    expect(reviewLookupMessage(undefined)).toBe(REVIEW_ORDER_NOT_FOUND);
  });

  it('names the order\'s real status when the order was found but is not delivered', () => {
    const message = reviewLookupMessage('packing');

    expect(message).toMatch(/packing/i);
    expect(message).toMatch(/delivered/i);
    expect(message).not.toMatch(/could not find/i);
  });

  it('uses the customer-facing label, not the raw database value', () => {
    expect(reviewLookupMessage('out_for_delivery')).toMatch(/out for delivery/i);
    expect(reviewLookupMessage('out_for_delivery')).not.toMatch(/out_for_delivery/);
  });

  it('labels the legacy statuses the shop still has on old orders', () => {
    expect(reviewLookupMessage('processing')).toMatch(/processing/i);
    expect(reviewLookupMessage('shipped')).toMatch(/shipped/i);
  });

  it('says a cancelled order can never be reviewed rather than "not yet"', () => {
    const message = reviewLookupMessage('cancelled');

    expect(message).toMatch(/cancelled/i);
    expect(message).not.toMatch(/once (it|your order) (is|has been)/i);
  });

  it('never echoes an email address back to the reader', () => {
    for (const status of [null, 'packing', 'cancelled', 'delivered']) {
      expect(reviewLookupMessage(status)).not.toMatch(/@/);
    }
  });
});

/**
 * The recent-orders widget already knows the customer's order number, and
 * checkout already saved the email they used. Making them retype both — with
 * the exact spelling the order carries — is the step the client got stuck on.
 */
describe('rememberedReviewIdentity', () => {
  const orders = [
    { orderNumber: 'TBS-100740-4243' },
    { orderNumber: 'TBS-100600-1111' },
  ];

  it('offers the most recent order and the saved checkout email', () => {
    expect(rememberedReviewIdentity(orders, 'AdminPretty@Gmail.com ')).toEqual({
      orderNumber: 'TBS-100740-4243',
      email: 'adminpretty@gmail.com',
    });
  });

  it('normalizes a remembered order number the same way the server does', () => {
    expect(rememberedReviewIdentity([{ orderNumber: '  tbs-100740-4243 ' }], null)).toEqual({
      orderNumber: 'TBS-100740-4243',
      email: '',
    });
  });

  it('offers nothing when this device has no history', () => {
    expect(rememberedReviewIdentity([], null)).toEqual({ orderNumber: '', email: '' });
  });

  it('still offers the email when only the order history is missing', () => {
    expect(rememberedReviewIdentity([], 'maria@example.com')).toEqual({
      orderNumber: '',
      email: 'maria@example.com',
    });
  });

  it('ignores a stored value that is not a usable email', () => {
    expect(rememberedReviewIdentity(orders, '   ').email).toBe('');
  });
});
