import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Hero from './Hero';

describe('Hero', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the announced window and a big live countdown from the finish date', () => {
    render(
      <Hero
        onShopAll={vi.fn()}
        onGetAccess={vi.fn()}
        batchNumber={42}
        startsAt="2026-06-22T00:00:00Z"
        endsAt="2026-06-24T14:09:30Z"
        isBatchOpen
      />,
    );

    // Batch label + announced window are featured.
    expect(screen.getAllByText(/№042/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Jun 22 – 24/)).toBeInTheDocument();

    // Big countdown shows each unit (2d 14h 09m 30s) with labels.
    expect(screen.getByText('Days')).toBeInTheDocument();
    expect(screen.getByText('Hrs')).toBeInTheDocument();
    expect(screen.getByText('Min')).toBeInTheDocument();
    expect(screen.getByText('Sec')).toBeInTheDocument();
    expect(screen.getByTestId('countdown-days')).toHaveTextContent('02');
    expect(screen.getByTestId('countdown-hours')).toHaveTextContent('14');
    expect(screen.getByTestId('countdown-seconds')).toHaveTextContent('30');
  });

  it('shows a closed state once the finish date has passed', () => {
    render(
      <Hero
        onShopAll={vi.fn()}
        onGetAccess={vi.fn()}
        batchNumber={42}
        startsAt="2026-06-10T00:00:00Z"
        endsAt="2026-06-20T00:00:00Z"
        isBatchOpen={false}
      />,
    );

    expect(screen.getByText(/group buy has closed/i)).toBeInTheDocument();
    expect(screen.queryByTestId('countdown-days')).not.toBeInTheDocument();
  });

  it('omits the countdown panel when no dates are set', () => {
    render(<Hero onShopAll={vi.fn()} onGetAccess={vi.fn()} batchNumber={42} isBatchOpen />);

    expect(screen.queryByTestId('countdown-days')).not.toBeInTheDocument();
    expect(screen.queryByText('Days')).not.toBeInTheDocument();
  });
});
