import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LeftoverClaimPanel from './LeftoverClaimPanel';
import type { GroupBuyRemainingItem } from '../../types';

// Mock the claims hook so the panel can be tested without Supabase. The hook's
// callbacks are memoized in production (useCallback), so return STABLE function
// identities here — otherwise the load effect would re-run every render.
const mockFetchRemaining = vi.fn();
const mockSubmitClaim = vi.fn();
const stableHook = {
  busy: false,
  error: null,
  fetchRemaining: (...args: unknown[]) => mockFetchRemaining(...args),
  submitClaim: (...args: unknown[]) => mockSubmitClaim(...args),
};
vi.mock('../../hooks/useGroupBuyClaims', () => ({
  useGroupBuyClaims: () => stableHook,
}));

// Storage upload is only used when a proof file is attached.
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn(() => ({ data: { publicUrl: 'https://cdn/proof.jpg' } }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
        getPublicUrl: () => mockGetPublicUrl(),
      }),
    },
  },
}));

const remaining: GroupBuyRemainingItem[] = [
  { product_id: 'p1', product_name: 'BPC-157 5mg', cap_quantity: 50, reserved: 45, remaining: 5 },
  { product_id: 'p2', product_name: 'GHK-Cu 10mg', cap_quantity: 30, reserved: 30, remaining: 0 },
];

function renderPanel(onClaimed = vi.fn()) {
  return render(
    <LeftoverClaimPanel batchId="batch-1" orderNumber="TBS-1234" onClaimed={onClaimed} />,
  );
}

describe('LeftoverClaimPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchRemaining.mockResolvedValue(remaining);
    mockSubmitClaim.mockResolvedValue({ order_number: 'TBS-5678', total: 1200 });
    mockUpload.mockResolvedValue({ error: null });
  });

  it('lists only products with remaining surplus', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Claim leftover units' })).toBeInTheDocument();
    });
    expect(screen.getByText('BPC-157 5mg')).toBeInTheDocument();
    expect(screen.getByText('5 left to claim')).toBeInTheDocument();
    // p2 has 0 remaining — filtered out.
    expect(screen.queryByText('GHK-Cu 10mg')).not.toBeInTheDocument();
  });

  it('renders nothing when no surplus exists', async () => {
    mockFetchRemaining.mockResolvedValueOnce([
      { product_id: 'p2', product_name: 'GHK-Cu 10mg', cap_quantity: 30, reserved: 30, remaining: 0 },
    ]);

    const { container } = renderPanel();

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('submits a claim and shows the new add-on order number', async () => {
    const onClaimed = vi.fn();
    renderPanel(onClaimed);

    await waitFor(() => {
      expect(screen.getByText('BPC-157 5mg')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByRole('spinbutton'), '2');
    await userEvent.type(screen.getByLabelText('Confirm your email'), 'buyer@example.com');
    await userEvent.click(screen.getByRole('button', { name: /Claim leftover units/ }));

    await waitFor(() => {
      expect(mockSubmitClaim).toHaveBeenCalledWith({
        orderNumber: 'TBS-1234',
        email: 'buyer@example.com',
        items: [{ product_id: 'p1', quantity: 2 }],
        paymentProofUrl: null,
      });
    });
    expect(await screen.findByText('TBS-5678')).toBeInTheDocument();
    expect(onClaimed).toHaveBeenCalledWith('TBS-5678');
  });

  it('clamps quantity to the remaining max', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('BPC-157 5mg')).toBeInTheDocument();
    });

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    await userEvent.type(input, '99');
    // Max remaining is 5.
    expect(input.value).toBe('5');
  });

  it('surfaces server error messages from the claim', async () => {
    mockSubmitClaim.mockRejectedValueOnce(new Error('Only 1 left to claim'));
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('BPC-157 5mg')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByRole('spinbutton'), '3');
    await userEvent.type(screen.getByLabelText('Confirm your email'), 'buyer@example.com');
    await userEvent.click(screen.getByRole('button', { name: /Claim leftover units/ }));

    expect(await screen.findByText('Only 1 left to claim')).toBeInTheDocument();
  });

  it('keeps submit disabled until a quantity and valid email are provided', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('BPC-157 5mg')).toBeInTheDocument();
    });

    const submit = screen.getByRole('button', { name: /Claim leftover units/ });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByRole('spinbutton'), '1');
    expect(submit).toBeDisabled(); // still no email

    await userEvent.type(screen.getByLabelText('Confirm your email'), 'buyer@example.com');
    expect(submit).not.toBeDisabled();
  });
});
