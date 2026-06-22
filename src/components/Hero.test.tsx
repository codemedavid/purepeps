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

  it('renders the announced window and a live countdown from the finish date', () => {
    render(
      <Hero
        onShopAll={vi.fn()}
        onGetAccess={vi.fn()}
        batchNumber={42}
        startsAt="2026-06-22T00:00:00Z"
        endsAt="2026-06-24T14:00:00Z"
        isBatchOpen
      />,
    );

    expect(screen.getAllByText('№042').length).toBeGreaterThan(0);
    expect(screen.getByText('Jun 22 – 24')).toBeInTheDocument();
    expect(screen.getByText(/closes in 2d 14h/i)).toBeInTheDocument();
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

    expect(screen.getAllByText(/closed/i).length).toBeGreaterThan(0);
  });

  it('omits the window and countdown when no dates are set', () => {
    render(<Hero onShopAll={vi.fn()} onGetAccess={vi.fn()} batchNumber={42} isBatchOpen />);

    expect(screen.queryByText(/closes in/i)).not.toBeInTheDocument();
    expect(screen.queryByText('–', { exact: false })).not.toBeInTheDocument();
  });
});
