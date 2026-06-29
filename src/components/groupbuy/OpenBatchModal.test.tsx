import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpenBatchModal } from './OpenBatchModal';

describe('OpenBatchModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <OpenBatchModal open={false} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('does not ask the admin to pick tiers or prices', () => {
    render(<OpenBatchModal open onSubmit={vi.fn()} onCancel={vi.fn()} />);

    // Tiers (and their pricing) now default to the server's active tier set, so
    // the open form no longer surfaces a tier picker.
    expect(screen.queryByText(/access tiers for this batch/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/all access/i)).not.toBeInTheDocument();
    // No money fields in the open flow at all.
    expect(screen.queryByText(/₱|PHP/)).not.toBeInTheDocument();
  });

  it('submits a trimmed name with the announced dates, without tier ids', async () => {
    const onSubmit = vi.fn();
    render(<OpenBatchModal open onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/batch name/i), '  June Drop  ');
    await userEvent.click(screen.getByRole('button', { name: /open batch/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'June Drop',
      startsAt: null,
      endsAt: null,
    });
  });

  it('submits the announced start and finish dates', async () => {
    const onSubmit = vi.fn();
    render(<OpenBatchModal open onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/start date/i), '2026-06-22');
    await userEvent.type(screen.getByLabelText(/finish date/i), '2026-07-05');
    await userEvent.click(screen.getByRole('button', { name: /open batch/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: null,
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
