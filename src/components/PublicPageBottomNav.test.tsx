import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicPageBottomNav from './PublicPageBottomNav';
import { readStorefrontRequest } from '../utils/storefrontNavigation';

const mockFlags = vi.fn();
const mockGetTotalItems = vi.fn();

vi.mock('../contexts/FeatureFlagsContext', () => ({
  useFeatureFlagsContext: () => mockFlags(),
}));

vi.mock('../hooks/useCart', () => ({
  useCart: () => ({ getTotalItems: mockGetTotalItems }),
}));

const ALL_ON = {
  products: true,
  calculator: true,
  protocols: true,
  track_order: true,
  faq: true,
  lab_reports: true,
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
    mockGetTotalItems.mockReturnValue(0);
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

  it('routes Cart back to the storefront asking for the cart view', async () => {
    const user = userEvent.setup();
    mockGetTotalItems.mockReturnValue(3);
    renderAt('/coa');

    await user.click(screen.getByRole('button', { name: 'Cart, 3 items' }));

    expect(screen.getByTestId('storefront')).toHaveTextContent('cart');
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

  it('resets scroll when Cart routes back to the storefront', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    renderAt('/coa');

    await user.click(screen.getByRole('button', { name: 'Cart, 0 items' }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    scrollTo.mockRestore();
  });

  it('shows the locally persisted cart count', () => {
    mockGetTotalItems.mockReturnValue(2);

    renderAt('/coa');

    expect(screen.getByTestId('bottom-nav-cart-badge')).toHaveTextContent('2');
  });
});
