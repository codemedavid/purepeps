import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StorefrontNoticeModal from './StorefrontNoticeModal';
import { DEFAULT_STOREFRONT_NOTICE } from '../utils/storefrontNotice';

const notice = {
  ...DEFAULT_STOREFRONT_NOTICE,
  title: 'Important Notice',
  subtitle: 'Please read before continuing',
  body: 'Sold strictly for research purposes only.\n\nImproper handling may carry risks.',
  highlight: 'NO MEET UPS · NO PICK UPS · NO RUSH ORDERS',
  policyTitle: '🚚 Order Today, Deliver Tomorrow Policy',
  policyLines: 'Taking of orders: Monday - Friday\nCut-off is at 5:00 PM',
  buttonLabel: 'I Understand & Agree',
  footerNote: 'This notice is shown on every visit to the storefront.',
};

describe('StorefrontNoticeModal', () => {
  it('applies the configured curated visual style', () => {
    render(<StorefrontNoticeModal notice={{ ...notice, style: 'critical' }} onAccept={vi.fn()} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('data-style', 'critical');
    expect(screen.getByTestId('notice-icon')).toHaveClass('text-red-600');
  });

  it('renders the title and subtitle', () => {
    render(<StorefrontNoticeModal notice={notice} onAccept={vi.fn()} />);

    expect(screen.getByText('Important Notice')).toBeInTheDocument();
    expect(screen.getByText('Please read before continuing')).toBeInTheDocument();
  });

  it('renders each body paragraph separately', () => {
    render(<StorefrontNoticeModal notice={notice} onAccept={vi.fn()} />);

    expect(screen.getByText('Sold strictly for research purposes only.')).toBeInTheDocument();
    expect(screen.getByText('Improper handling may carry risks.')).toBeInTheDocument();
  });

  it('renders the highlight strip', () => {
    render(<StorefrontNoticeModal notice={notice} onAccept={vi.fn()} />);

    expect(screen.getByText('NO MEET UPS · NO PICK UPS · NO RUSH ORDERS')).toBeInTheDocument();
  });

  it('renders the policy card title and each policy line', () => {
    render(<StorefrontNoticeModal notice={notice} onAccept={vi.fn()} />);

    expect(screen.getByText('🚚 Order Today, Deliver Tomorrow Policy')).toBeInTheDocument();
    expect(screen.getByText('Taking of orders: Monday - Friday')).toBeInTheDocument();
    expect(screen.getByText('Cut-off is at 5:00 PM')).toBeInTheDocument();
  });

  it('renders the footer note', () => {
    render(<StorefrontNoticeModal notice={notice} onAccept={vi.fn()} />);

    expect(screen.getByText('This notice is shown on every visit to the storefront.')).toBeInTheDocument();
  });

  it('calls onAccept when the agree button is clicked', async () => {
    const onAccept = vi.fn();
    render(<StorefrontNoticeModal notice={notice} onAccept={onAccept} />);

    await userEvent.click(screen.getByRole('button', { name: /I Understand & Agree/ }));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('exposes an accessible modal dialog labelled by its title', () => {
    render(<StorefrontNoticeModal notice={notice} onAccept={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Important Notice');
  });

  it('moves focus to the agree button so keyboard users can dismiss it', () => {
    render(<StorefrontNoticeModal notice={notice} onAccept={vi.fn()} />);

    expect(screen.getByRole('button', { name: /I Understand & Agree/ })).toHaveFocus();
  });

  it('cannot be dismissed with Escape — acknowledgement is required', async () => {
    const onAccept = vi.fn();
    render(<StorefrontNoticeModal notice={notice} onAccept={onAccept} />);

    await userEvent.keyboard('{Escape}');

    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // --- Optional sections ---

  it('omits the highlight strip when it is empty', () => {
    render(<StorefrontNoticeModal notice={{ ...notice, highlight: '' }} onAccept={vi.fn()} />);

    expect(screen.queryByTestId('notice-highlight')).not.toBeInTheDocument();
  });

  it('omits the policy card when it has no title and no lines', () => {
    render(
      <StorefrontNoticeModal notice={{ ...notice, policyTitle: '', policyLines: '' }} onAccept={vi.fn()} />,
    );

    expect(screen.queryByTestId('notice-policy')).not.toBeInTheDocument();
  });

  it('renders the policy card when only lines are configured', () => {
    render(<StorefrontNoticeModal notice={{ ...notice, policyTitle: '' }} onAccept={vi.fn()} />);

    expect(screen.getByTestId('notice-policy')).toBeInTheDocument();
    expect(screen.getByText('Cut-off is at 5:00 PM')).toBeInTheDocument();
  });

  it('omits the subtitle and footer note when they are empty', () => {
    render(<StorefrontNoticeModal notice={{ ...notice, subtitle: '', footerNote: '' }} onAccept={vi.fn()} />);

    expect(screen.queryByText('Please read before continuing')).not.toBeInTheDocument();
    expect(
      screen.queryByText('This notice is shown on every visit to the storefront.'),
    ).not.toBeInTheDocument();
  });

  // --- Preview mode (admin editor) ---

  describe('preview mode', () => {
    it('is not exposed as a dialog', () => {
      render(<StorefrontNoticeModal notice={notice} onAccept={vi.fn()} isPreview />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Important Notice')).toBeInTheDocument();
    });

    it('does not steal focus', () => {
      render(<StorefrontNoticeModal notice={notice} onAccept={vi.fn()} isPreview />);

      expect(document.body).toHaveFocus();
    });

    it('renders an inert agree button', async () => {
      const onAccept = vi.fn();
      render(<StorefrontNoticeModal notice={notice} onAccept={onAccept} isPreview />);

      const button = screen.getByText(/I Understand & Agree/);
      await userEvent.click(button, { pointerEventsCheck: 0 });

      expect(onAccept).not.toHaveBeenCalled();
    });
  });

  it('falls back to a default button label when none is configured', () => {
    render(<StorefrontNoticeModal notice={{ ...notice, buttonLabel: '' }} onAccept={vi.fn()} />);

    expect(screen.getByRole('button', { name: /I Understand/ })).toBeInTheDocument();
  });
});
