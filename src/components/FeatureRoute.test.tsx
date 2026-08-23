import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import FeatureRoute from './FeatureRoute';
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from '../utils/featureFlags';

const mockUseFeatureFlagsContext = vi.fn();

vi.mock('../contexts/FeatureFlagsContext', () => ({
  useFeatureFlagsContext: () => mockUseFeatureFlagsContext(),
}));

/** Point the mocked context at a given flag set / loading state. */
function withFlags(flags: Partial<FeatureFlags>, loading = false) {
  mockUseFeatureFlagsContext.mockReturnValue({
    flags: { ...DEFAULT_FEATURE_FLAGS, ...flags },
    loading,
    error: null,
    setFeatureEnabled: vi.fn(),
    refetch: vi.fn(),
  });
}

/** Renders /faq behind a FeatureRoute, with a distinguishable home route. */
function renderFaqRoute() {
  return render(
    <MemoryRouter initialEntries={['/faq']}>
      <Routes>
        <Route path="/" element={<div>Storefront home</div>} />
        <Route
          path="/faq"
          element={
            <FeatureRoute feature="faq">
              <div>FAQ page</div>
            </FeatureRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FeatureRoute', () => {
  it('renders the page when the feature is on', () => {
    withFlags({ faq: true });

    renderFaqRoute();

    expect(screen.getByText('FAQ page')).toBeInTheDocument();
  });

  it('redirects to the storefront when the feature is off', () => {
    withFlags({ faq: false });

    renderFaqRoute();

    expect(screen.queryByText('FAQ page')).not.toBeInTheDocument();
    expect(screen.getByText('Storefront home')).toBeInTheDocument();
  });

  it('does NOT redirect while flags are still loading', () => {
    // Redirecting on an unresolved flag would bounce every visitor off the page
    // on a cold load, before the setting has even been read.
    withFlags({ faq: false }, true);

    renderFaqRoute();

    expect(screen.queryByText('Storefront home')).not.toBeInTheDocument();
    expect(screen.queryByText('FAQ page')).not.toBeInTheDocument();
  });

  it('gates each feature on its own flag', () => {
    withFlags({ faq: true, calculator: false });

    render(
      <MemoryRouter initialEntries={['/calculator']}>
        <Routes>
          <Route path="/" element={<div>Storefront home</div>} />
          <Route
            path="/calculator"
            element={
              <FeatureRoute feature="calculator">
                <div>Calculator page</div>
              </FeatureRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Calculator page')).not.toBeInTheDocument();
    expect(screen.getByText('Storefront home')).toBeInTheDocument();
  });
});
