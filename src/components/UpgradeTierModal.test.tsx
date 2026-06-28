import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpgradeTierModal } from './UpgradeTierModal';

const submitUpgrade = vi.fn();

let mockOptions = [
  {
    id: 't2',
    name: 'All Access',
    description: null,
    price: 500,
    isAllAccess: true,
    categoryIds: null,
    currentPrice: 300,
    delta: 200,
  },
];
let mockLoading = false;

vi.mock('../hooks/useTierUpgrade', () => ({
  useTierUpgrade: () => ({
    options: mockOptions,
    loading: mockLoading,
    error: null,
    refresh: vi.fn(),
    submitUpgrade,
  }),
}));

vi.mock('../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({
    paymentMethods: [
      { id: 'm1', name: 'GCash', account_number: '0917', account_name: 'PP', qr_code_url: null },
    ],
    loading: false,
  }),
}));

// Stub ImageUpload with a button that reports an uploaded proof URL.
vi.mock('./ImageUpload', () => ({
  default: ({ onImageChange }: { onImageChange: (url: string | undefined) => void }) => (
    <button type="button" onClick={() => onImageChange('https://proof.example/p.png')}>
      Upload proof
    </button>
  ),
}));

describe('UpgradeTierModal', () => {
  beforeEach(() => {
    submitUpgrade.mockReset();
    submitUpgrade.mockResolvedValue({ success: true });
    mockOptions = [
      {
        id: 't2',
        name: 'All Access',
        description: null,
        price: 500,
        isAllAccess: true,
        categoryIds: null,
        currentPrice: 300,
        delta: 200,
      },
    ];
    mockLoading = false;
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <UpgradeTierModal open={false} memberEmail="a@b.com" onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists higher tiers with the price difference to pay', () => {
    render(<UpgradeTierModal open memberEmail="a@b.com" onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /All Access/i })).toBeInTheDocument();
    // The delta (+₱200) is the headline price for the upgrade.
    expect(screen.getByText(/\+₱?200/)).toBeInTheDocument();
  });

  it('shows an empty state when no upgrades are available', () => {
    mockOptions = [];
    render(<UpgradeTierModal open memberEmail="a@b.com" onClose={vi.fn()} />);

    expect(screen.getByText(/no upgrades available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit upgrade/i })).toBeDisabled();
  });

  it('blocks submit until a payment proof is attached', async () => {
    render(<UpgradeTierModal open memberEmail="a@b.com" onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /All Access/i }));
    await userEvent.click(screen.getByRole('button', { name: /submit upgrade/i }));

    expect(submitUpgrade).not.toHaveBeenCalled();
    expect(screen.getByText(/attach a screenshot/i)).toBeInTheDocument();
  });

  it('submits the chosen upgrade and shows a pending confirmation', async () => {
    const onSubmitted = vi.fn();
    render(
      <UpgradeTierModal open memberEmail="a@b.com" onClose={vi.fn()} onSubmitted={onSubmitted} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /All Access/i }));
    await userEvent.click(screen.getByRole('button', { name: /upload proof/i }));
    await userEvent.click(screen.getByRole('button', { name: /submit upgrade/i }));

    expect(submitUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodId: 'm1',
        paymentMethodName: 'GCash',
        paymentProofUrl: 'https://proof.example/p.png',
        tier: expect.objectContaining({ id: 't2', delta: 200 }),
      }),
    );
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/upgrade submitted/i)).toBeInTheDocument();
  });

  it('calls onClose from the cancel button', async () => {
    const onClose = vi.fn();
    render(<UpgradeTierModal open memberEmail="a@b.com" onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
