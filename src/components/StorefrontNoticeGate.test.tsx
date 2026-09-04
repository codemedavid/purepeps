import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StorefrontNoticeGate from './StorefrontNoticeGate';
import { clearVisitAcknowledgements, DEFAULT_STOREFRONT_NOTICE } from '../utils/storefrontNotice';

const mockRecordEvent = vi.fn().mockResolvedValue(undefined);
const mockUseStorefrontNotice = vi.fn();
vi.mock('../hooks/useStorefrontNotice', () => ({
  useStorefrontNotice: (...args: unknown[]) => mockUseStorefrontNotice(...args),
}));

const loaded = (overrides = {}) => ({
  notice: {
    ...DEFAULT_STOREFRONT_NOTICE,
    id: '6f8a5363-56b9-4fdd-a985-260c8f910ccb',
    title: 'Important Notice',
    ...overrides,
  },
  loading: false,
  error: null,
  recordEvent: mockRecordEvent,
});

describe('StorefrontNoticeGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    clearVisitAcknowledgements();
    mockUseStorefrontNotice.mockReturnValue(loaded());
  });

  it('loads for the current page and shopper type', () => {
    render(<StorefrontNoticeGate pageId="faq" shopperType="verified_member" />);

    expect(mockUseStorefrontNotice).toHaveBeenCalledWith('faq', 'verified_member');
  });

  it('shows and counts an eligible notice', async () => {
    render(<StorefrontNoticeGate pageId="storefront.menu" shopperType="visitor" />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(mockRecordEvent).toHaveBeenCalledWith('impression'));
  });

  it('keeps the legal notice visible while a published row is still loading', () => {
    mockUseStorefrontNotice.mockReturnValue({
      ...loaded(),
      notice: DEFAULT_STOREFRONT_NOTICE,
      loading: true,
    });
    render(<StorefrontNoticeGate pageId="storefront.menu" shopperType="visitor" />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Important Notice')).toBeInTheDocument();
  });

  it('renders nothing when no notice is available', () => {
    mockUseStorefrontNotice.mockReturnValue({ ...loaded(), notice: null, loading: false });
    render(<StorefrontNoticeGate pageId="faq" shopperType="visitor" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('acknowledges the notice and counts the action', async () => {
    render(<StorefrontNoticeGate pageId="storefront.menu" shopperType="visitor" />);

    await userEvent.click(await screen.findByRole('button', { name: /I Understand/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockRecordEvent).toHaveBeenCalledWith('acknowledgement');
  });

  it('does not show a once-per-browser notice after the same version was acknowledged', async () => {
    mockUseStorefrontNotice.mockReturnValue(loaded({ frequency: 'once', version: 4 }));
    const { unmount } = render(<StorefrontNoticeGate pageId="storefront.menu" shopperType="visitor" />);
    await userEvent.click(await screen.findByRole('button', { name: /I Understand/ }));
    unmount();

    render(<StorefrontNoticeGate pageId="storefront.menu" shopperType="visitor" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a once-per-browser notice again after publication increments its version', async () => {
    mockUseStorefrontNotice.mockReturnValue(loaded({ frequency: 'once', version: 4 }));
    const { unmount } = render(<StorefrontNoticeGate pageId="storefront.menu" shopperType="visitor" />);
    await userEvent.click(await screen.findByRole('button', { name: /I Understand/ }));
    unmount();

    mockUseStorefrontNotice.mockReturnValue(loaded({ frequency: 'once', version: 5 }));
    render(<StorefrontNoticeGate pageId="storefront.menu" shopperType="visitor" />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('does not re-show an every-visit notice after switching pages this visit', async () => {
    const { unmount } = render(<StorefrontNoticeGate pageId="storefront.menu" shopperType="visitor" />);
    await userEvent.click(await screen.findByRole('button', { name: /I Understand/ }));
    unmount();

    mockUseStorefrontNotice.mockReturnValue(loaded({ id: 'other-page-notice', frequency: 'every_visit' }));
    render(<StorefrontNoticeGate pageId="coa" shopperType="visitor" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
