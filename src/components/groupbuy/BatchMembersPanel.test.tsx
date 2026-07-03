import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchMembersPanel } from './BatchMembersPanel';
import type { AccessRequest, AccessStatus } from '../../utils/access';

function member(
  id: string,
  email: string,
  status: AccessStatus,
  tierName: string,
  amount = 300,
): AccessRequest {
  return {
    id,
    email,
    payment_method_id: null,
    payment_method_name: 'GCash',
    payment_proof_url: null,
    amount,
    status,
    notes: null,
    group_buy_batch_id: 'batch-1',
    tier_id: 'tier-1',
    tier_name: tierName,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  };
}

const MEMBERS = [
  member('m1', 'alice@example.com', 'approved', '300 Access'),
  member('m2', 'bob@example.com', 'pending', '200 Access', 200),
];

describe('BatchMembersPanel', () => {
  it('summarizes unlocked vs awaiting-review counts', () => {
    render(
      <BatchMembersPanel batchNumber={3} members={MEMBERS} loading={false} onReload={vi.fn()} />,
    );
    expect(screen.getByText(/Batch #3 members/)).toBeInTheDocument();
    expect(screen.getByText(/1 unlocked · 1 awaiting review/)).toBeInTheDocument();
  });

  it('lists every member with their tier and email', () => {
    render(
      <BatchMembersPanel batchNumber={3} members={MEMBERS} loading={false} onReload={vi.fn()} />,
    );
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText(/300 Access/)).toBeInTheDocument();
  });

  it('filters to only pending members when the "Awaiting review" chip is chosen', async () => {
    const user = userEvent.setup();
    render(
      <BatchMembersPanel batchNumber={3} members={MEMBERS} loading={false} onReload={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Awaiting review' }));
    expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('searches members by email', async () => {
    const user = userEvent.setup();
    render(
      <BatchMembersPanel batchNumber={3} members={MEMBERS} loading={false} onReload={vi.fn()} />,
    );
    await user.type(screen.getByPlaceholderText('Search email…'), 'alice');
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.queryByText('bob@example.com')).not.toBeInTheDocument();
  });

  it('calls onReload when Refresh is clicked', async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    render(
      <BatchMembersPanel batchNumber={3} members={MEMBERS} loading={false} onReload={onReload} />,
    );
    await user.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('renders no tier corrector when tiers/onSetTier are omitted', () => {
    render(
      <BatchMembersPanel batchNumber={3} members={MEMBERS} loading={false} onReload={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Change tier' })).not.toBeInTheDocument();
  });

  it('applies a tier change and reloads the roster', async () => {
    const user = userEvent.setup();
    const onSetTier = vi.fn().mockResolvedValue({ success: true });
    const onReload = vi.fn();
    const tiers = [
      { id: 'tier-1', name: '200 Access', price: 200, isAllAccess: false },
      { id: 'tier-2', name: '300 Access', price: 300, isAllAccess: false },
    ];
    render(
      <BatchMembersPanel
        batchNumber={3}
        members={[MEMBERS[0]]}
        loading={false}
        onReload={onReload}
        tiers={tiers}
        onSetTier={onSetTier}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change tier' }));
    await user.selectOptions(screen.getByRole('combobox'), 'tier-2');
    await user.click(screen.getByRole('button', { name: /Set tier/ }));

    expect(onSetTier).toHaveBeenCalledWith('m1', 'tier-2', '300 Access');
    expect(onReload).toHaveBeenCalled();
  });

  it('surfaces an error and keeps the corrector open when the tier change fails', async () => {
    const user = userEvent.setup();
    const onSetTier = vi.fn().mockResolvedValue({ success: false, error: 'Tier not found' });
    const tiers = [{ id: 'tier-2', name: '300 Access', price: 300, isAllAccess: false }];
    render(
      <BatchMembersPanel
        batchNumber={3}
        members={[MEMBERS[0]]}
        loading={false}
        onReload={vi.fn()}
        tiers={tiers}
        onSetTier={onSetTier}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change tier' }));
    await user.selectOptions(screen.getByRole('combobox'), 'tier-2');
    await user.click(screen.getByRole('button', { name: /Set tier/ }));

    expect(await screen.findByText('Tier not found')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
