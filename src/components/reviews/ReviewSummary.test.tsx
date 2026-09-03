import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReviewSummary from './ReviewSummary';

const ratings = (...values: number[]) => values.map((rating) => ({ rating }));

describe('ReviewSummary', () => {
  it('leads with the average and how many reviews back it', () => {
    render(<ReviewSummary reviews={ratings(5, 5, 4)} />);

    expect(screen.getByText('4.7')).toBeInTheDocument();
    expect(screen.getByText(/3 reviews/i)).toBeInTheDocument();
  });

  it('says "1 review" rather than "1 reviews"', () => {
    render(<ReviewSummary reviews={ratings(5)} />);

    expect(screen.getByText(/1 review\b/i)).toBeInTheDocument();
  });

  it('breaks the score down per star', () => {
    render(<ReviewSummary reviews={ratings(5, 5, 4, 1)} />);

    const fiveStar = screen.getByTestId('histogram-row-5');
    expect(within(fiveStar).getByText('2')).toBeInTheDocument();

    const fourStar = screen.getByTestId('histogram-row-4');
    expect(within(fourStar).getByText('1')).toBeInTheDocument();

    const threeStar = screen.getByTestId('histogram-row-3');
    expect(within(threeStar).getByText('0')).toBeInTheDocument();
  });

  it('invites the first review instead of showing a bare zero', () => {
    render(<ReviewSummary reviews={[]} />);

    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
  });

  it('ignores an out-of-range rating rather than letting it drag the average', () => {
    render(<ReviewSummary reviews={ratings(5, 5, 99)} />);

    expect(screen.getByText('5.0')).toBeInTheDocument();
    expect(screen.getByText(/2 reviews/i)).toBeInTheDocument();
  });
});
