import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import FeatureVisibilityManager from './FeatureVisibilityManager';
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from '../utils/featureFlags';

const mockUseFeatureFlagsContext = vi.fn();
const mockSetFeatureEnabled = vi.fn();

vi.mock('../contexts/FeatureFlagsContext', () => ({
  useFeatureFlagsContext: () => mockUseFeatureFlagsContext(),
}));

function withFlags(flags: Partial<FeatureFlags> = {}, loading = false) {
  mockUseFeatureFlagsContext.mockReturnValue({
    flags: { ...DEFAULT_FEATURE_FLAGS, ...flags },
    loading,
    error: null,
    setFeatureEnabled: mockSetFeatureEnabled,
    refetch: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSetFeatureEnabled.mockResolvedValue(undefined);
});

describe('FeatureVisibilityManager', () => {
  it('renders one switch per controllable feature', () => {
    withFlags();

    render(<FeatureVisibilityManager />);

    expect(screen.getAllByRole('switch')).toHaveLength(7);
    for (const label of [
      'Products',
      'Calculator',
      'Protocols',
      'Track Order',
      'FAQ',
      'Lab Reports',
      'Customer Reviews',
    ]) {
      expect(screen.getByRole('switch', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('reflects the stored state of each switch', () => {
    withFlags({ faq: false });

    render(<FeatureVisibilityManager />);

    expect(screen.getByRole('switch', { name: /FAQ/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: /Protocols/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('turns a feature off when its switch is clicked', async () => {
    const user = userEvent.setup();
    withFlags();

    render(<FeatureVisibilityManager />);
    await user.click(screen.getByRole('switch', { name: /FAQ/i }));

    expect(mockSetFeatureEnabled).toHaveBeenCalledWith('faq', false);
  });

  it('turns a feature back on when its switch is clicked again', async () => {
    const user = userEvent.setup();
    withFlags({ track_order: false });

    render(<FeatureVisibilityManager />);
    await user.click(screen.getByRole('switch', { name: /Track Order/i }));

    expect(mockSetFeatureEnabled).toHaveBeenCalledWith('track_order', true);
  });

  it('toggles only the feature that was clicked', async () => {
    const user = userEvent.setup();
    withFlags();

    render(<FeatureVisibilityManager />);
    await user.click(screen.getByRole('switch', { name: /Calculator/i }));

    expect(mockSetFeatureEnabled).toHaveBeenCalledTimes(1);
    expect(mockSetFeatureEnabled).toHaveBeenCalledWith('calculator', false);
  });

  it('reassures the admin that switching off preserves content', () => {
    withFlags();

    render(<FeatureVisibilityManager />);

    expect(screen.getByText(/nothing is deleted/i)).toBeInTheDocument();
  });

  it('surfaces a save failure instead of appearing to succeed', async () => {
    const user = userEvent.setup();
    withFlags();
    mockSetFeatureEnabled.mockRejectedValue(new Error('permission denied'));

    render(<FeatureVisibilityManager />);
    await user.click(screen.getByRole('switch', { name: /FAQ/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i));
  });

  it('disables the switches while flags are still loading', () => {
    withFlags({}, true);

    render(<FeatureVisibilityManager />);

    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle).toBeDisabled();
    }
  });
});
