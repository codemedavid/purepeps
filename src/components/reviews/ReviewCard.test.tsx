import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReviewCard from './ReviewCard';
import type { PublicReview } from '../../utils/reviews';

function review(overrides: Partial<PublicReview> = {}): PublicReview {
  return {
    id: 'rev-1',
    product_id: 'prod-1',
    product_name: 'BPC-157',
    variation_name: '10mg',
    display_name: 'Sakura22',
    rating: 5,
    body: 'Arrived well packed and the vials were sealed properly.',
    media_urls: [],
    admin_reply: null,
    admin_replied_at: null,
    created_at: '2026-08-14T02:00:00Z',
    ...overrides,
  };
}

describe('ReviewCard', () => {
  it('shows the pseudonym, the score and the review itself', () => {
    render(<ReviewCard review={review()} />);

    expect(screen.getByText('Sakura22')).toBeInTheDocument();
    expect(screen.getByLabelText('Rated 5 out of 5 stars')).toBeInTheDocument();
    expect(
      screen.getByText('Arrived well packed and the vials were sealed properly.'),
    ).toBeInTheDocument();
  });

  it('names the exact product and variation reviewed', () => {
    // "BPC-157" alone is ambiguous when a product sells in several strengths,
    // and strength is the thing a shopper is actually comparing.
    render(<ReviewCard review={review()} />);

    expect(screen.getByText(/BPC-157/)).toBeInTheDocument();
    expect(screen.getByText(/10mg/)).toBeInTheDocument();
  });

  it('carries a Verified Purchase badge', () => {
    // Every row reachable from get_approved_reviews was tied to a delivered
    // order before it was written, so the badge is a fact about the pipeline.
    render(<ReviewCard review={review()} />);

    expect(screen.getByText(/verified purchase/i)).toBeInTheDocument();
  });

  it('shows the review date', () => {
    render(<ReviewCard review={review()} />);

    expect(screen.getByText(/Aug/)).toBeInTheDocument();
  });

  it('shows the shop reply, attributed, when there is one', () => {
    render(
      <ReviewCard
        review={review({
          admin_reply: 'Thank you! Glad it arrived safely.',
          admin_replied_at: '2026-08-15T02:00:00Z',
        })}
      />,
    );

    expect(screen.getByText('Thank you! Glad it arrived safely.')).toBeInTheDocument();
    expect(screen.getByText(/pure peps/i)).toBeInTheDocument();
  });

  it('omits the reply block entirely when the shop has not replied', () => {
    render(<ReviewCard review={review()} />);

    expect(screen.queryByText(/pure peps/i)).not.toBeInTheDocument();
  });

  it('renders attached photos with alt text that names the reviewer', () => {
    render(
      <ReviewCard
        review={review({ media_urls: ['https://img.example/a.jpg', 'https://img.example/b.jpg'] })}
      />,
    );

    const photos = screen.getAllByRole('img');
    expect(photos).toHaveLength(2);
    expect(photos[0]).toHaveAttribute('src', 'https://img.example/a.jpg');
    expect(photos[0]).toHaveAccessibleName(/Sakura22/);
  });

  it('falls back to the anonymous label when no pseudonym was given', () => {
    render(<ReviewCard review={review({ display_name: '' })} />);

    expect(screen.getByText('Verified Customer')).toBeInTheDocument();
  });

  it('NEVER renders reviewer identity, even if the row carries it', () => {
    // The privacy boundary is enforced in the RPC's return signature, but this
    // component is the last place a mistake would become visible to the public.
    // Handing it an over-wide row proves it projects rather than spreads.
    const leaky = {
      ...review(),
      reviewer_name: 'Maria Santos',
      reviewer_email: 'maria@example.com',
      reviewer_phone: '09171234567',
      order_number: 'PP-1042',
    } as PublicReview;

    const { container } = render(<ReviewCard review={leaky} />);

    expect(container.textContent).not.toContain('Maria Santos');
    expect(container.textContent).not.toContain('maria@example.com');
    expect(container.textContent).not.toContain('09171234567');
    expect(container.textContent).not.toContain('PP-1042');
  });
});
