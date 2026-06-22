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

  it('submits a trimmed name and the access fee', async () => {
    const onSubmit = vi.fn();
    render(<OpenBatchModal open onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/batch name/i), '  June Drop  ');
    const fee = screen.getByLabelText(/access fee/i);
    await userEvent.clear(fee);
    await userEvent.type(fee, '300');
    await userEvent.click(screen.getByRole('button', { name: /open batch/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'June Drop',
      accessFee: 300,
      startsAt: null,
      endsAt: null,
    });
  });

  it('sends a null name when the name field is left blank', async () => {
    const onSubmit = vi.fn();
    render(<OpenBatchModal open onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /open batch/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: null,
      accessFee: 250,
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
      accessFee: 250,
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

  it('blocks submit and shows an error for a negative access fee', async () => {
    const onSubmit = vi.fn();
    render(<OpenBatchModal open onSubmit={onSubmit} onCancel={vi.fn()} />);

    const fee = screen.getByLabelText(/access fee/i);
    await userEvent.clear(fee);
    await userEvent.type(fee, '-5');
    await userEvent.click(screen.getByRole('button', { name: /open batch/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/access fee must be 0 or more/i)).toBeInTheDocument();
  });

  it('treats a blank access fee as null (server default)', async () => {
    const onSubmit = vi.fn();
    render(<OpenBatchModal open onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.clear(screen.getByLabelText(/access fee/i));
    await userEvent.click(screen.getByRole('button', { name: /open batch/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: null,
      accessFee: null,
      startsAt: null,
      endsAt: null,
    });
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
