import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import GetAccess from './GetAccess';

// GetAccess is a container over several data hooks; stub them so the test can
// drive the one axis under test — whether request intake is open or closed.
const mockUseAccessIntake = vi.fn();

vi.mock('../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ paymentMethods: [], loading: false }),
}));
vi.mock('../hooks/useAccessRequests', () => ({
  useAccessRequests: () => ({ submitRequest: vi.fn() }),
}));
vi.mock('../hooks/useActiveAccess', () => ({
  useActiveAccess: () => ({ info: { batchNumber: 3, accessFee: 250, name: null } }),
}));
vi.mock('../hooks/useAccessIntake', () => ({
  useAccessIntake: () => mockUseAccessIntake(),
}));
vi.mock('../hooks/useAccessTiers', () => ({
  useAccessTiers: () => ({
    tiers: [
      { id: 'tier-1', name: 'All Access', description: null, price: 250, isAllAccess: true, categoryIds: null },
    ],
    loading: false,
  }),
}));
vi.mock('../hooks/useCategories', () => ({
  useCategories: () => ({ categories: [] }),
}));
vi.mock('./ImageUpload', () => ({ default: () => <div data-testid="image-upload" /> }));

const baseProps = {
  onBack: vi.fn(),
  onVerified: vi.fn(),
  verifyEmail: vi.fn(),
  watchPendingEmail: vi.fn(),
  isVerified: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GetAccess intake gating', () => {
  it('shows the payment form and submit button while intake is OPEN', () => {
    mockUseAccessIntake.mockReturnValue({ isIntakeOpen: true, loading: false, setIntakeOpen: vi.fn() });

    render(<GetAccess {...baseProps} />);

    expect(screen.getByRole('button', { name: /submit for review/i })).toBeInTheDocument();
    expect(screen.getByText(/choose your tier/i)).toBeInTheDocument();
  });

  it('hides the payment form but keeps verify when intake is CLOSED', () => {
    mockUseAccessIntake.mockReturnValue({ isIntakeOpen: false, loading: false, setIntakeOpen: vi.fn() });

    render(<GetAccess {...baseProps} />);

    // No way to submit a new request…
    expect(screen.queryByRole('button', { name: /submit for review/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/choose your tier/i)).not.toBeInTheDocument();
    // …but a closed notice and the verify path remain for approved members.
    expect(screen.getByText(/new access requests are closed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify email/i })).toBeInTheDocument();
  });

  it('does not flash the closed screen while the intake flag is still loading', () => {
    mockUseAccessIntake.mockReturnValue({ isIntakeOpen: false, loading: true, setIntakeOpen: vi.fn() });

    render(<GetAccess {...baseProps} />);

    // Loading + not-yet-known → fall through to the form, not the closed screen.
    expect(screen.queryByText(/new access requests are closed/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeInTheDocument();
  });
});
