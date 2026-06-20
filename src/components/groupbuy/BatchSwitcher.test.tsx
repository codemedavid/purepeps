import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchSwitcher } from './BatchSwitcher';
import type { GroupBuyBatch } from '../../types';

function batch(overrides: Partial<GroupBuyBatch> = {}): GroupBuyBatch {
  return {
    id: 'b1',
    batch_number: 7,
    status: 'open',
    name: null,
    opened_at: '2026-06-01T00:00:00Z',
    closed_at: null,
    finalized_at: null,
    fulfillment_stage: null,
    ...overrides,
  };
}

const batches = [
  batch({ id: 'b7', batch_number: 7, status: 'open' }),
  batch({ id: 'b6', batch_number: 6, status: 'closed', name: 'May Drop' }),
];

describe('BatchSwitcher', () => {
  it('shows the selected batch number on the trigger', () => {
    render(<BatchSwitcher batches={batches} selectedBatch={batches[0]} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Batch #7/ })).toBeInTheDocument();
  });

  it('opens the menu and lists the batches', async () => {
    render(<BatchSwitcher batches={batches} selectedBatch={batches[0]} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Batch #7/ }));
    expect(screen.getByRole('menuitem', { name: /Batch #6/ })).toBeInTheDocument();
  });

  it('calls onSelect with the chosen batch id and closes the menu', async () => {
    const onSelect = vi.fn();
    render(<BatchSwitcher batches={batches} selectedBatch={batches[0]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /Batch #7/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Batch #6/ }));
    expect(onSelect).toHaveBeenCalledWith('b6');
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('renders a placeholder when no batch is selected', () => {
    render(<BatchSwitcher batches={[]} selectedBatch={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /no batch/i })).toBeInTheDocument();
  });
});
