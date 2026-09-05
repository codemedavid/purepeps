import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicPageBottomNav from './PublicPageBottomNav';
import { readStorefrontRequest } from '../utils/storefrontNavigation';

const mockFlags = vi.fn();

vi.mock('../contexts/FeatureFlagsContext', () => ({
  useFeatureFlagsContext: () => mockFlags(),
}));

const ALL_ON = {
  products: true,
  calculator: true,
  protocols: true,
  track_order: true,
  faq: true,
  lab_reports: true,
  reviews: true,
};

// Stands in for the storefront route so we can read what the bar asked it to open.
const StorefrontProbe = () => {
  const location = useLocation();
  return <div data-testid="storefront">{readStorefrontRequest(location.state) ?? 'none'}</div>;
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<StorefrontProbe />} />
        <Route path="*" element={<PublicPageBottomNav />} />
      </Routes>
    </MemoryRouter>,
  );

describe('PublicPageBottomNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlags.mockReturnValue({ flags: { ...ALL_ON } });
  });

  it('highlights Lab Reports while the Lab Reports page is open', () => {
    renderAt('/coa');

    expect(screen.getByRole('link', { name: 'Labs' })).toHaveAttribute('aria-current', 'page');
  });

  it('hides Lab Reports when the Lab Reports visibility setting is off', () => {
    mockFlags.mockReturnValue({ flags: { ...ALL_ON, lab_reports: false } });

    renderAt('/protocols');

    expect(screen.queryByRole('link', { name: 'Labs' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Guides' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['Home', 'home'],
    ['Shop', 'shop'],
  ])('routes %s back to the storefront asking for the %s view', async (label, request) => {
    const user = userEvent.setup();
    renderAt('/coa');

    await user.click(screen.getByRole('button', { name: label }));

    expect(screen.getByTestId('storefront')).toHaveTextContent(request);
  });

  it('offers no cart tab, because the cart lives in the header', () => {
    renderAt('/coa');

    expect(screen.queryByRole('button', { name: /^Cart/ })).not.toBeInTheDocument();
  });

  it('highlights Reviews while the reviews page is open', () => {
    renderAt('/reviews');

    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute('aria-current', 'page');
  });

  it('hides Reviews when the customer reviews feature is off', () => {
    mockFlags.mockReturnValue({ flags: { ...ALL_ON, reviews: false } });

    renderAt('/coa');

    expect(screen.queryByRole('link', { name: 'Reviews' })).not.toBeInTheDocument();
  });

  it.each([['Home'], ['Shop']])(
    'resets scroll when %s routes back to the storefront',
    async (label) => {
      const user = userEvent.setup();
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
      renderAt('/coa');

      await user.click(screen.getByRole('button', { name: label }));

      expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
      scrollTo.mockRestore();
    },
  );

});
