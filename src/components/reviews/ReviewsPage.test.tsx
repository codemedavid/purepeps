import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ReviewsPage from './ReviewsPage';
import { REVIEW_DISCLAIMER, type PublicReview } from '../../utils/reviews';

const mockUseProductReviews = vi.fn();

// The form owns its own hook; the page only decides whether to show it.
vi.mock('./ReviewForm', () => ({
  default: () => <div data-testid="review-form" />,
}));

vi.mock('../../hooks/useProductReviews', () => ({
  useProductReviews: (...args: unknown[]) => mockUseProductReviews(...args),
  default: (...args: unknown[]) => mockUseProductReviews(...args),
}));

function row(overrides: Partial<PublicReview> = {}): PublicReview {
  return {
    id: 'rev-1',
    product_id: 'prod-1',
    product_name: 'BPC-157',
    variation_name: '10mg',
    display_name: 'Sakura22',
    rating: 5,
    body: 'Sealed and well packed on arrival.',
    media_urls: [],
    admin_reply: null,
    admin_replied_at: null,
    created_at: '2026-08-14T02:00:00Z',
    ...overrides,
  };
}

function withReviews(reviews: PublicReview[], extra: Record<string, unknown> = {}) {
  mockUseProductReviews.mockReturnValue({
    reviews,
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReviewsPage', () => {
  it('titles the page for customers, not for the database', () => {
    withReviews([row()]);

    render(<ReviewsPage />);

    expect(screen.getByRole('heading', { level: 1, name: /customer reviews/i })).toBeInTheDocument();
  });

  it('shows the score summary above the reviews', () => {
    withReviews([row(), row({ id: 'rev-2', rating: 4 })]);

    render(<ReviewsPage />);

    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText(/2 reviews/i)).toBeInTheDocument();
  });

  it('renders one card per published review', () => {
    withReviews([row(), row({ id: 'rev-2', display_name: 'Bea', body: 'Fast shipping, thank you!' })]);

    render(<ReviewsPage />);

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('Sakura22')).toBeInTheDocument();
    expect(screen.getByText('Bea')).toBeInTheDocument();
  });

  it('carries the medical disclaimer verbatim', () => {
    // The client supplied this wording. Paraphrasing it on the page would put
    // different words in front of customers than the ones they approved.
    withReviews([row()]);

    render(<ReviewsPage />);

    expect(screen.getByText(REVIEW_DISCLAIMER)).toBeInTheDocument();
  });

  it('shows the disclaimer even when there are no reviews yet', () => {
    // The notice is about peptides, not about reviews, so an empty page is not
    // a reason to drop it.
    withReviews([]);

    render(<ReviewsPage />);

    expect(screen.getByText(REVIEW_DISCLAIMER)).toBeInTheDocument();
  });

  it('says it is loading rather than showing an empty page', () => {
    mockUseProductReviews.mockReturnValue({
      reviews: [],
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(<ReviewsPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(/no reviews yet/i)).not.toBeInTheDocument();
  });

  it('distinguishes a failed load from having no reviews', () => {
    // "No reviews yet" after a network failure is a lie about the shop.
    mockUseProductReviews.mockReturnValue({
      reviews: [],
      loading: false,
      error: 'Could not load reviews right now.',
      refresh: vi.fn(),
    });

    render(<ReviewsPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(/could not load reviews/i);
    expect(screen.queryByText(/no reviews yet/i)).not.toBeInTheDocument();
  });

  it('lets a shopper narrow the list to one product', async () => {
    const user = userEvent.setup();
    withReviews([
      row(),
      row({ id: 'rev-2', product_id: 'prod-2', product_name: 'TB-500', display_name: 'Bea' }),
    ]);

    render(<ReviewsPage />);
    expect(screen.getAllByRole('article')).toHaveLength(2);

    await user.selectOptions(screen.getByLabelText(/product/i), 'TB-500');

    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Bea')).toBeInTheDocument();
  });

  it('lists each product once in the filter however many reviews it has', () => {
    withReviews([row(), row({ id: 'rev-2' }), row({ id: 'rev-3', product_name: 'TB-500' })]);

    render(<ReviewsPage />);

    const options = screen.getAllByRole('option');
    // All products, BPC-157, TB-500
    expect(options).toHaveLength(3);
  });

  it('keeps the form behind a button so reviews are what the page opens on', async () => {
    // A shopper arrives to READ reviews. Leading with a form makes the page
    // look like a task rather than the social proof it exists to show.
    withReviews([row()]);

    render(<ReviewsPage />);

    expect(screen.queryByTestId('review-form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /write a review/i })).toBeInTheDocument();
  });

  it('opens the form on request', async () => {
    const user = userEvent.setup();
    withReviews([row()]);

    render(<ReviewsPage />);
    await user.click(screen.getByRole('button', { name: /write a review/i }));

    expect(screen.getByTestId('review-form')).toBeInTheDocument();
  });

  it('still offers the form when there are no reviews yet', async () => {
    // An empty page is exactly when a first review is most valuable, so the
    // invitation must not be conditional on already having some.
    withReviews([]);

    render(<ReviewsPage />);

    expect(screen.getByRole('button', { name: /write a review/i })).toBeInTheDocument();
  });

  it('recomputes the summary from the filtered set, not the whole list', async () => {
    // A 5.0 average sitting above a filtered list of 1-star reviews would be
    // read as the score for what is on screen.
    const user = userEvent.setup();
    withReviews([
      row({ rating: 5 }),
      row({ id: 'rev-2', product_id: 'prod-2', product_name: 'TB-500', rating: 1 }),
    ]);

    render(<ReviewsPage />);
    expect(screen.getByText('3.0')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/product/i), 'TB-500');

    expect(screen.getByText('1.0')).toBeInTheDocument();
  });
});
