import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditBatchModal } from './EditBatchModal';
import type { GroupBuyBatch } from '../../types';

const BATCH: GroupBuyBatch = {
  id: 'batch-1',
  batch_number: 3,
  status: 'open',
  name: 'June Drop',
  opened_at: '2026-06-20T00:00:00+00:00',
  closed_at: null,
  finalized_at: null,
  fulfillment_stage: null,
  starts_at: '2026-06-22T00:00:00+00:00',
  ends_at: '2026-07-05T00:00:00+00:00',
};

const TIERS = [
  { id: 't1', name: 'All Access', price: 250 },
  { id: 't2', name: 'Peptides Only', price: 150 },
];

describe('EditBatchModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <EditBatchModal
        open={false}
        batch={BATCH}
        tiers={TIERS}
        selectedTierIds={['t1']}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('pre-fills the current name, dates, and offered tiers', () => {
    render(
      <EditBatchModal
        open
        batch={BATCH}
        tiers={TIERS}
        selectedTierIds={['t1']}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/batch name/i)).toHaveValue('June Drop');
    expect(screen.getByLabelText(/start date/i)).toHaveValue('2026-06-22');
    expect(screen.getByLabelText(/finish date/i)).toHaveValue('2026-07-05');
    expect(screen.getByRole('checkbox', { name: /all access/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /peptides only/i })).not.toBeChecked();
  });

  it('submits the edited name, dates, and unchanged tier selection', async () => {
    const onSubmit = vi.fn();
    render(
      <EditBatchModal
        open
        batch={BATCH}
        tiers={TIERS}
        selectedTierIds={['t1']}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText(/batch name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '  July Drop  ');
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'July Drop',
      startsAt: '2026-06-22',
      endsAt: '2026-07-05',
      tierIds: ['t1'],
    });
  });

  it('includes a newly-ticked tier in the submitted selection', async () => {
    const onSubmit = vi.fn();
    render(
      <EditBatchModal
        open
        batch={BATCH}
        tiers={TIERS}
        selectedTierIds={['t1']}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /peptides only/i }));
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ tierIds: ['t1', 't2'] }),
    );
  });

  it('sends a null name when the field is cleared', async () => {
    const onSubmit = vi.fn();
    render(
      <EditBatchModal
        open
        batch={BATCH}
        tiers={TIERS}
        selectedTierIds={['t1']}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.clear(screen.getByLabelText(/batch name/i));
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: null }));
  });

  it('blocks submit when the finish date is not after the start date', async () => {
    const onSubmit = vi.fn();
    render(
      <EditBatchModal
        open
        batch={BATCH}
        tiers={TIERS}
        selectedTierIds={['t1']}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    const finish = screen.getByLabelText(/finish date/i);
    await userEvent.clear(finish);
    await userEvent.type(finish, '2026-06-21');
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/finish date must be after the start date/i)).toBeInTheDocument();
  });

  it('calls onCancel from the cancel button', async () => {
    const onCancel = vi.fn();
    render(
      <EditBatchModal
        open
        batch={BATCH}
        tiers={TIERS}
        selectedTierIds={['t1']}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
