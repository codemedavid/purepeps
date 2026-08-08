import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StorefrontNoticeManager from './StorefrontNoticeManager';
import { DEFAULT_STOREFRONT_NOTICE } from '../utils/storefrontNotice';

const mockSaveNotice = vi.fn();
const mockUseStorefrontNotice = vi.fn();
vi.mock('../hooks/useStorefrontNotice', () => ({
  useStorefrontNotice: () => mockUseStorefrontNotice(),
}));

const stored = {
  ...DEFAULT_STOREFRONT_NOTICE,
  title: 'Important Notice',
  subtitle: 'Please read before continuing',
  body: 'Research use only.',
  highlight: 'NO MEET UPS',
  policyTitle: 'Delivery Policy',
  policyLines: 'Mon - Fri\nCut-off 5PM',
  buttonLabel: 'I Understand & Agree',
  footerNote: 'Shown every visit.',
};

describe('StorefrontNoticeManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveNotice.mockResolvedValue(undefined);
    mockUseStorefrontNotice.mockReturnValue({
      notice: stored,
      loading: false,
      error: null,
      saveNotice: mockSaveNotice,
    });
  });

  it('shows a loading state while settings load', () => {
    mockUseStorefrontNotice.mockReturnValue({
      notice: DEFAULT_STOREFRONT_NOTICE,
      loading: true,
      error: null,
      saveNotice: mockSaveNotice,
    });

    render(<StorefrontNoticeManager />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('prefills every field from the stored notice', () => {
    render(<StorefrontNoticeManager />);

    expect(screen.getByLabelText(/^Title$/i)).toHaveValue('Important Notice');
    expect(screen.getByLabelText(/Subtitle/i)).toHaveValue('Please read before continuing');
    expect(screen.getByLabelText(/Body/i)).toHaveValue('Research use only.');
    expect(screen.getByLabelText(/Highlight/i)).toHaveValue('NO MEET UPS');
    expect(screen.getByLabelText(/Policy Title/i)).toHaveValue('Delivery Policy');
    expect(screen.getByLabelText(/Policy Lines/i)).toHaveValue('Mon - Fri\nCut-off 5PM');
    expect(screen.getByLabelText(/Button Label/i)).toHaveValue('I Understand & Agree');
    expect(screen.getByLabelText(/Footer Note/i)).toHaveValue('Shown every visit.');
    expect(screen.getByLabelText(/Show this notice/i)).toBeChecked();
  });

  it('reflects the disabled flag in the toggle', () => {
    mockUseStorefrontNotice.mockReturnValue({
      notice: { ...stored, isEnabled: false },
      loading: false,
      error: null,
      saveNotice: mockSaveNotice,
    });

    render(<StorefrontNoticeManager />);

    expect(screen.getByLabelText(/Show this notice/i)).not.toBeChecked();
  });

  it('saves edited content', async () => {
    render(<StorefrontNoticeManager />);

    const titleInput = screen.getByLabelText(/^Title$/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Heads Up');
    await userEvent.click(screen.getByRole('button', { name: /Save Notice/i }));

    await waitFor(() =>
      expect(mockSaveNotice).toHaveBeenCalledWith(expect.objectContaining({ title: 'Heads Up' })),
    );
  });

  it('saves the enabled toggle', async () => {
    render(<StorefrontNoticeManager />);

    await userEvent.click(screen.getByLabelText(/Show this notice/i));
    await userEvent.click(screen.getByRole('button', { name: /Save Notice/i }));

    await waitFor(() =>
      expect(mockSaveNotice).toHaveBeenCalledWith(expect.objectContaining({ isEnabled: false })),
    );
  });

  it('confirms a successful save', async () => {
    render(<StorefrontNoticeManager />);

    await userEvent.click(screen.getByRole('button', { name: /Save Notice/i }));

    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  it('shows an error message when the save fails', async () => {
    mockSaveNotice.mockRejectedValue(new Error('denied'));

    render(<StorefrontNoticeManager />);

    await userEvent.click(screen.getByRole('button', { name: /Save Notice/i }));

    expect(await screen.findByText(/denied/i)).toBeInTheDocument();
  });

  it('shows a live preview of the notice content', async () => {
    render(<StorefrontNoticeManager />);

    const titleInput = screen.getByLabelText(/^Title$/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Heads Up');

    expect(screen.getByTestId('notice-preview')).toHaveTextContent('Heads Up');
  });
});
