import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpenBatchModal } from './OpenBatchModal';

vi.mock('../../hooks/useTierLibrary', () => ({
  useTierLibrary: () => ({
    tiers: [
      { id: 't1', name: 'Weight Management', description: null, price: 300, isAllAccess: false, categoryIds: [] },
      { id: 't2', name: 'All Access', description: null, price: 500, isAllAccess: true, categoryIds: null },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

describe('OpenBatchModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <OpenBatchModal open={false} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the tier library with prices, all selected by default', () => {
    render(<OpenBatchModal open onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const weight = screen.getByRole('button', { name: /Weight Management/i });
    const allAccess = screen.getByRole('button', { name: /All Access/i });
    expect(weight).toHaveAttribute('aria-pressed', 'true');
    expect(allAccess).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/300/)).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();
  });

  it('submits the selected tier ids with a trimmed name', async () => {
    const onSubmit = vi.fn();
    render(<OpenBatchModal open onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/batch name/i), '  June Drop  ');
    // Deselect the all-access tier so only Weight Management is offered.
    await userEvent.click(screen.getByRole('button', { name: /All Access/i }));
    await userEvent.click(screen.getByRole('button', { name: /open batch/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'June Drop',
      tierIds: ['t1'],
      startsAt: null,
      endsAt: null,
    });
  });

  it('blocks submit when no tier is selected', async () => {
    const onSubmit = vi.fn();
    render(<OpenBatchModal open onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Weight Management/i }));
    await userEvent.click(screen.getByRole('button', { name: /All Access/i }));
    await userEvent.click(screen.getByRole('button', { name: /open batch/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/choose at least one access tier/i)).toBeInTheDocument();
  });

  it('submits the announced start and finish dates', async () => {
    const onSubmit = vi.fn();
    render(<OpenBatchModal open onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/start date/i), '2026-06-22');
    await userEvent.type(screen.getByLabelText(/finish date/i), '2026-07-05');
    await userEvent.click(screen.getByRole('button', { name: /open batch/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: null,
      tierIds: ['t1', 't2'],
      startsAt: '2026-06-22',
      endsAt: '2026-07-05',
    });
  });

  it('blocks submit when the finish date is not after the start date', async () => {
    const onSubmit = vi.fn();
    render(<OpenBatchModal open onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/start date/i), '2026-07-05');
    await userEvent.type(screen.getByLabelText(/finish date/i), '2026-06-22');
    await userEvent.click(screen.getByRole('button', { name: /open batch/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/finish date must be after the start date/i)).toBeInTheDocument();
  });

  it('warns that opening will close the current batch when closesCurrent is set', () => {
    render(<OpenBatchModal open closesCurrent onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/close the current batch/i)).toBeInTheDocument();
  });

  it('calls onCancel from the cancel button', async () => {
    const onCancel = vi.fn();
    render(<OpenBatchModal open onSubmit={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
