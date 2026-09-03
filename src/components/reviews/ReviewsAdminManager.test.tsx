import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ReviewsAdminManager from './ReviewsAdminManager';
import type { AdminReview } from '../../utils/reviews';

const mockUseAdminReviews = vi.fn();

vi.mock('../../hooks/useAdminReviews', () => ({
  useAdminReviews: () => mockUseAdminReviews(),
  default: () => mockUseAdminReviews(),
}));

function review(overrides: Partial<AdminReview> = {}): AdminReview {
  return {
    id: 'rev-1',
    order_id: 'order-1',
    order_number: 'PP-1042',
    product_id: 'prod-1',
    product_name: 'BPC-157',
    variation_name: '10mg',
    reviewer_name: 'Maria Santos',
    reviewer_email: 'maria@example.com',
    reviewer_phone: '09171234567',
    display_name: 'Sakura22',
    rating: 5,
    body: 'Sealed and well packed on arrival.',
    media_urls: [],
    status: 'pending',
    admin_reply: null,
    admin_replied_at: null,
    moderated_at: null,
    moderated_by: null,
    created_at: '2026-08-14T02:00:00Z',
    updated_at: '2026-08-14T02:00:00Z',
    ...overrides,
  };
}

const setStatus = vi.fn().mockResolvedValue(undefined);
const reply = vi.fn().mockResolvedValue(undefined);
const remove = vi.fn().mockResolvedValue(undefined);

function withReviews(reviews: AdminReview[], extra: Record<string, unknown> = {}) {
  mockUseAdminReviews.mockReturnValue({
    reviews,
    loading: false,
    error: null,
    setStatus,
    reply,
    remove,
    refresh: vi.fn(),
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setStatus.mockResolvedValue(undefined);
  reply.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
});

describe('ReviewsAdminManager — the queue', () => {
  it('opens on Pending, the only tab holding work', async () => {
    withReviews([review(), review({ id: 'rev-2', status: 'approved' })]);

    render(<ReviewsAdminManager />);

    expect(screen.getByRole('tab', { name: /pending/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('counts what is waiting so the tab is worth glancing at', () => {
    withReviews([review(), review({ id: 'rev-2' }), review({ id: 'rev-3', status: 'approved' })]);

    render(<ReviewsAdminManager />);

    expect(screen.getByRole('tab', { name: /pending/i })).toHaveTextContent('2');
  });

  it('switches to another moderation state on demand', async () => {
    const user = userEvent.setup();
    withReviews([review(), review({ id: 'rev-2', status: 'approved', display_name: 'Bea' })]);

    render(<ReviewsAdminManager />);
    await user.click(screen.getByRole('tab', { name: /approved/i }));

    expect(screen.getByText('Bea')).toBeInTheDocument();
    expect(screen.queryByText('Sakura22')).not.toBeInTheDocument();
  });

  it('says the queue is clear rather than showing a blank panel', () => {
    withReviews([review({ status: 'approved' })]);

    render(<ReviewsAdminManager />);

    expect(screen.getByText(/nothing pending/i)).toBeInTheDocument();
  });

  it('distinguishes a failed load from an empty queue', () => {
    mockUseAdminReviews.mockReturnValue({
      reviews: [],
      loading: false,
      error: 'Could not load the review queue.',
      setStatus,
      reply,
      remove,
      refresh: vi.fn(),
    });

    render(<ReviewsAdminManager />);

    expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i);
    expect(screen.queryByText(/nothing pending/i)).not.toBeInTheDocument();
  });
});

describe('ReviewsAdminManager — verification', () => {
  it('shows the reviewer identity an admin needs to verify the purchase', () => {
    withReviews([review()]);

    render(<ReviewsAdminManager />);

    expect(screen.getByText(/Maria Santos/)).toBeInTheDocument();
    expect(screen.getByText(/maria@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/09171234567/)).toBeInTheDocument();
    expect(screen.getByText(/PP-1042/)).toBeInTheDocument();
  });

  it('marks that identity as private so it is never mistaken for public copy', () => {
    // The same card shows the public pseudonym beside the real name. Without a
    // label an admin cannot tell at a glance which half customers can see.
    withReviews([review()]);

    render(<ReviewsAdminManager />);

    expect(screen.getByText(/not shown publicly/i)).toBeInTheDocument();
  });

  it('shows the public pseudonym alongside, so both halves are visible', () => {
    withReviews([review()]);

    render(<ReviewsAdminManager />);

    expect(screen.getByText('Sakura22')).toBeInTheDocument();
  });
});

describe('ReviewsAdminManager — actions', () => {
  it('approves a pending review', async () => {
    const user = userEvent.setup();
    withReviews([review()]);

    render(<ReviewsAdminManager />);
    await user.click(screen.getByRole('button', { name: /approve/i }));

    expect(setStatus).toHaveBeenCalledWith('rev-1', 'approved');
  });

  it('rejects a pending review', async () => {
    const user = userEvent.setup();
    withReviews([review()]);

    render(<ReviewsAdminManager />);
    await user.click(screen.getByRole('button', { name: /reject/i }));

    expect(setStatus).toHaveBeenCalledWith('rev-1', 'rejected');
  });

  it('hides a review that is already public', async () => {
    const user = userEvent.setup();
    withReviews([review({ status: 'approved' })]);

    render(<ReviewsAdminManager />);
    await user.click(screen.getByRole('tab', { name: /approved/i }));
    await user.click(screen.getByRole('button', { name: /hide/i }));

    expect(setStatus).toHaveBeenCalledWith('rev-1', 'hidden');
  });

  it('confirms before deleting, because a delete cannot be undone', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    withReviews([review()]);

    render(<ReviewsAdminManager />);
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('deletes once the admin confirms', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    withReviews([review()]);

    render(<ReviewsAdminManager />);
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(remove).toHaveBeenCalledWith('rev-1');
    confirmSpy.mockRestore();
  });

  it('sends a reply written in the card', async () => {
    const user = userEvent.setup();
    withReviews([review()]);

    render(<ReviewsAdminManager />);
    const card = screen.getByRole('article');
    await user.type(within(card).getByLabelText(/reply/i), 'Thank you!');
    await user.click(within(card).getByRole('button', { name: /save reply/i }));

    expect(reply).toHaveBeenCalledWith('rev-1', 'Thank you!');
  });

  it('surfaces a failed action instead of looking like it worked', async () => {
    const user = userEvent.setup();
    setStatus.mockRejectedValue(new Error('denied'));
    withReviews([review()]);

    render(<ReviewsAdminManager />);
    await user.click(screen.getByRole('button', { name: /approve/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
