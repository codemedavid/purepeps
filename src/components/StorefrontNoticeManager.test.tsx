import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StorefrontNoticeManager from './StorefrontNoticeManager';
import { DEFAULT_STOREFRONT_NOTICE } from '../utils/storefrontNotice';

const mockSaveDraft = vi.fn();
const mockPublishNotice = vi.fn();
const mockArchiveNotice = vi.fn();
const mockDeleteNotice = vi.fn();
const mockDuplicateNotice = vi.fn();
const mockUseAdmin = vi.fn();

vi.mock('../hooks/useStorefrontNoticesAdmin', () => ({
  useStorefrontNoticesAdmin: () => mockUseAdmin(),
}));

const managed = {
  ...DEFAULT_STOREFRONT_NOTICE,
  id: '6f8a5363-56b9-4fdd-a985-260c8f910ccb',
  internalName: 'Legal notice',
  status: 'published' as const,
  version: 2,
  frequency: 'once' as const,
  pageIds: ['storefront.menu'] as const,
  title: 'Important Notice',
  body: 'Research use only.',
  buttonLabel: 'Agree',
  updatedAt: '2026-08-12T10:00:00.000Z',
  publishedAt: '2026-08-12T10:00:00.000Z',
  impressionCount: 20,
  acknowledgementCount: 15,
};

describe('StorefrontNoticeManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockSaveDraft.mockResolvedValue(managed);
    mockPublishNotice.mockResolvedValue(managed);
    mockArchiveNotice.mockResolvedValue(undefined);
    mockDeleteNotice.mockResolvedValue(undefined);
    mockDuplicateNotice.mockResolvedValue(managed);
    mockUseAdmin.mockReturnValue({
      notices: [managed],
      loading: false,
      error: null,
      saveDraft: mockSaveDraft,
      publishNotice: mockPublishNotice,
      archiveNotice: mockArchiveNotice,
      deleteNotice: mockDeleteNotice,
      duplicateNotice: mockDuplicateNotice,
    });
  });

  it('shows notice lifecycle, targeting, and aggregate performance', () => {
    render(<StorefrontNoticeManager />);

    expect(screen.getByText('Legal notice')).toBeInTheDocument();
    expect(screen.getByText(/Published/i)).toBeInTheDocument();
    expect(screen.getByText('20 impressions')).toBeInTheDocument();
    expect(screen.getByText('75% acknowledged')).toBeInTheDocument();
  });

  it('creates and saves an incomplete draft', async () => {
    render(<StorefrontNoticeManager />);
    await userEvent.click(screen.getByRole('button', { name: /Create Notice/i }));
    await userEvent.type(screen.getByLabelText(/Internal Name/i), 'Holiday campaign');
    await userEvent.click(screen.getByRole('button', { name: /Save Draft/i }));

    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledWith(expect.objectContaining({
      internalName: 'Holiday campaign',
      status: 'draft',
    })));
  });

  it('blocks publishing until required content is complete', async () => {
    render(<StorefrontNoticeManager />);
    await userEvent.click(screen.getByRole('button', { name: /Create Notice/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Publish$/i }));

    expect(await screen.findByText('Internal name is required.')).toBeInTheDocument();
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(mockPublishNotice).not.toHaveBeenCalled();
  });

  it('offers page, audience, frequency, style, schedule, and preview controls', async () => {
    render(<StorefrontNoticeManager />);
    await userEvent.click(screen.getByRole('button', { name: /Edit Legal notice/i }));

    expect(screen.getByLabelText(/Audience/i)).toHaveValue('everyone');
    expect(screen.getByLabelText(/Frequency/i)).toHaveValue('once');
    expect(screen.getByLabelText(/Style/i)).toHaveValue('warning');
    expect(screen.getByLabelText(/Start.*Manila/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Menu/i)).toBeChecked();
    expect(screen.getByTestId('notice-preview')).toHaveTextContent('Important Notice');
    await userEvent.click(screen.getByRole('button', { name: /Mobile preview/i }));
    expect(screen.getByTestId('notice-preview-frame')).toHaveClass('max-w-sm');
  });

  it('can republish an existing notice as a new version', async () => {
    render(<StorefrontNoticeManager />);
    await userEvent.click(screen.getByRole('button', { name: /Edit Legal notice/i }));
    await userEvent.click(screen.getByRole('button', { name: /Publish as New Version/i }));

    await waitFor(() => expect(mockPublishNotice).toHaveBeenCalledWith(expect.objectContaining({ id: managed.id }), true));
  });

  it('archives, duplicates, and deletes eligible notices', async () => {
    const archived = { ...managed, id: 'archived-id', internalName: 'Old notice', status: 'archived' as const };
    mockUseAdmin.mockReturnValue({
      ...mockUseAdmin(),
      notices: [managed, archived],
    });
    render(<StorefrontNoticeManager />);

    await userEvent.click(screen.getByRole('button', { name: /Archive Legal notice/i }));
    await userEvent.click(screen.getByRole('button', { name: /Duplicate Legal notice/i }));
    await userEvent.click(screen.getByRole('button', { name: /Delete Old notice/i }));

    expect(mockArchiveNotice).toHaveBeenCalledWith(managed);
    expect(mockDuplicateNotice).toHaveBeenCalledWith(managed);
    expect(mockDeleteNotice).toHaveBeenCalledWith(archived);
  });
});
