import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StorefrontNoticeGate from './StorefrontNoticeGate';
import { DEFAULT_STOREFRONT_NOTICE } from '../utils/storefrontNotice';

const mockUseStorefrontNotice = vi.fn();
vi.mock('../hooks/useStorefrontNotice', () => ({
  useStorefrontNotice: () => mockUseStorefrontNotice(),
}));

const loaded = (overrides = {}) => ({
  notice: { ...DEFAULT_STOREFRONT_NOTICE, title: 'Important Notice', ...overrides },
  loading: false,
  error: null,
  saveNotice: vi.fn(),
});

describe('StorefrontNoticeGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStorefrontNotice.mockReturnValue(loaded());
  });

  it('shows the notice once the settings have loaded', async () => {
    render(<StorefrontNoticeGate />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Important Notice')).toBeInTheDocument();
  });

  it('renders nothing while the settings are loading', () => {
    mockUseStorefrontNotice.mockReturnValue({ ...loaded(), loading: true });

    render(<StorefrontNoticeGate />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders nothing when the notice is disabled', () => {
    mockUseStorefrontNotice.mockReturnValue(loaded({ isEnabled: false }));

    render(<StorefrontNoticeGate />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the notice after the shopper acknowledges it', async () => {
    render(<StorefrontNoticeGate />);

    await userEvent.click(await screen.findByRole('button', { name: /I Understand/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does not persist the acknowledgement, so it reappears on the next visit', async () => {
    const { unmount } = render(<StorefrontNoticeGate />);

    await userEvent.click(await screen.findByRole('button', { name: /I Understand/ }));
    expect(localStorage.length).toBe(0);
    unmount();

    // A fresh mount stands in for a page refresh.
    render(<StorefrontNoticeGate />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
