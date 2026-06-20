import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchLifecycleBar } from './BatchLifecycleBar';
import type { GroupBuyBatch } from '../../types';
import type { ConfirmRequest } from './ConfirmDialog';

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

function setup(overrides: Partial<GroupBuyBatch> | null = {}) {
  const handlers = {
    onOpenBatch: vi.fn(),
    onOpenNewBatch: vi.fn(),
    onStartFinalizing: vi.fn(),
    onFinalize: vi.fn(),
    onReopen: vi.fn(),
    onClose: vi.fn(),
  };
  let lastRequest: ConfirmRequest | null = null;
  const requestConfirm = vi.fn((req: ConfirmRequest) => {
    lastRequest = req;
  });
  render(
    <BatchLifecycleBar
      batch={overrides === null ? null : batch(overrides)}
      busy={false}
      requestConfirm={requestConfirm}
      {...handlers}
    />,
  );
  return { handlers, requestConfirm, getRequest: () => lastRequest };
}

describe('BatchLifecycleBar', () => {
  it('routes Close through requestConfirm (danger) and fires onClose on confirm', async () => {
    const { handlers, requestConfirm, getRequest } = setup({ status: 'open' });

    await userEvent.click(screen.getByRole('button', { name: /Close/ }));

    expect(requestConfirm).toHaveBeenCalledTimes(1);
    expect(getRequest()?.tone).toBe('danger');
    expect(handlers.onClose).not.toHaveBeenCalled();

    getRequest()?.onConfirm();
    expect(handlers.onClose).toHaveBeenCalledWith('b1');
  });

  it('routes Start Finalizing through requestConfirm', async () => {
    const { handlers, getRequest } = setup({ status: 'open' });

    await userEvent.click(screen.getByRole('button', { name: /Start Finalizing/ }));
    getRequest()?.onConfirm();

    expect(handlers.onStartFinalizing).toHaveBeenCalledWith('b1');
  });

  it('opens the batch directly without a confirm when no batch is open', async () => {
    const { handlers, requestConfirm } = setup(null);

    await userEvent.click(screen.getByRole('button', { name: /Open a Batch/ }));

    expect(handlers.onOpenBatch).toHaveBeenCalledTimes(1);
    expect(requestConfirm).not.toHaveBeenCalled();
  });
});
