import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StarRating from './StarRating';

describe('StarRating — display mode', () => {
  it('states the score in text, not just in shapes', () => {
    // A row of filled shapes is invisible to a screen reader and to anyone who
    // cannot distinguish the fill colour, so the number has to be readable.
    render(<StarRating value={4} />);

    expect(screen.getByLabelText('Rated 4 out of 5 stars')).toBeInTheDocument();
  });

  it('renders the same five stars regardless of the score', () => {
    // Empty stars must still be drawn — five filled and five drawn look
    // identical when the count is what changes.
    const { container } = render(<StarRating value={2} />);

    expect(container.querySelectorAll('svg')).toHaveLength(5);
  });

  it('is not interactive when no handler is given', () => {
    render(<StarRating value={3} />);

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});

describe('StarRating — input mode', () => {
  it('exposes one radio per star inside a labelled group', () => {
    render(<StarRating value={0} onChange={vi.fn()} />);

    expect(screen.getByRole('radiogroup', { name: /rating/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('reports the star the customer picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: '4 stars' }));

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('marks only the chosen star as checked', () => {
    render(<StarRating value={3} onChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: '3 stars' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '4 stars' })).not.toBeChecked();
  });

  it('names one star in the singular', () => {
    // "1 stars" in a screen reader is the kind of detail that makes a form feel
    // unfinished.
    render(<StarRating value={0} onChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: '1 star' })).toBeInTheDocument();
  });

  it('can be reached and set from the keyboard alone', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalled();
  });
});
