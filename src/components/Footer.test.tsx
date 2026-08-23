import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import Footer from './Footer';
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from '../utils/featureFlags';

const mockUseFeatureFlagsContext = vi.fn();

vi.mock('../contexts/FeatureFlagsContext', () => ({
  useFeatureFlagsContext: () => mockUseFeatureFlagsContext(),
}));

function withFlags(flags: Partial<FeatureFlags> = {}) {
  mockUseFeatureFlagsContext.mockReturnValue({
    flags: { ...DEFAULT_FEATURE_FLAGS, ...flags },
    loading: false,
    error: null,
    setFeatureEnabled: vi.fn(),
    refetch: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Footer quick links', () => {
  it('lists every quick link when all features are on', () => {
    withFlags();

    render(<Footer />);

    for (const label of ['Products', 'Track Order', 'FAQ', 'Lab Reports']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('drops a quick link when its feature is switched off', () => {
    withFlags({ track_order: false, faq: false });

    render(<Footer />);

    expect(screen.queryByText('Track Order')).not.toBeInTheDocument();
    expect(screen.queryByText('FAQ')).not.toBeInTheDocument();
    expect(screen.getByText('Lab Reports')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
  });

  it('hides the Quick Links heading when nothing is left to link to', () => {
    withFlags({ products: false, track_order: false, faq: false, lab_reports: false });

    render(<Footer />);

    expect(screen.queryByText('Quick Links')).not.toBeInTheDocument();
  });

  it('keeps the brand and copyright regardless of feature visibility', () => {
    withFlags({ products: false, track_order: false, faq: false, lab_reports: false });

    render(<Footer />);

    expect(screen.getByText(/research use only/i)).toBeInTheDocument();
  });
});
