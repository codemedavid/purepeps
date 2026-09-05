import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GbLandingManager from './GbLandingManager';
import { DEFAULT_GB_LANDING, type GbLandingContent } from '../utils/gbLanding';

const save = vi.fn();
const state = {
  content: DEFAULT_GB_LANDING as GbLandingContent,
  loading: false,
  error: null as string | null,
};

vi.mock('../hooks/useGbLanding', () => ({
  useGbLanding: () => ({
    content: state.content,
    loading: state.loading,
    error: state.error,
    save: (next: GbLandingContent) => save(next),
    refetch: vi.fn(),
  }),
}));

const savedContent = (): GbLandingContent => save.mock.calls[0][0];

describe('GbLandingManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.content = DEFAULT_GB_LANDING;
    state.loading = false;
    state.error = null;
    save.mockResolvedValue(undefined);
  });

  it('loads the current landing copy into the form', () => {
    state.content = { ...DEFAULT_GB_LANDING, headline: 'Batch 12 is live,' };

    render(<GbLandingManager />);

    expect(screen.getByLabelText(/main headline/i)).toHaveValue('Batch 12 is live,');
    expect(screen.getByLabelText(/bottom supporting text/i)).toHaveValue(
      DEFAULT_GB_LANDING.bottomNote,
    );
  });

  it('saves an edited headline', async () => {
    const user = userEvent.setup();
    render(<GbLandingManager />);

    const headline = screen.getByLabelText(/main headline/i);
    await user.clear(headline);
    await user.type(headline, 'Batch 13 opens Friday');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(savedContent().headline).toBe('Batch 13 opens Friday');
  });

  it('exposes the group buy status as an explicit choice', async () => {
    const user = userEvent.setup();
    render(<GbLandingManager />);

    const status = screen.getByLabelText(/group buy status/i);
    expect(status).toHaveValue('auto');

    await user.selectOptions(status, 'closed');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(savedContent().statusMode).toBe('closed');
  });

  it('edits every field of all four stages', async () => {
    const user = userEvent.setup();
    render(<GbLandingManager />);

    // Each stage exposes its own icon, title, description, date and time.
    for (const stage of [1, 2, 3, 4]) {
      expect(screen.getByLabelText(new RegExp(`stage ${stage} title`, 'i'))).toBeInTheDocument();
      expect(
        screen.getByLabelText(new RegExp(`stage ${stage} description`, 'i')),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(new RegExp(`stage ${stage} date`, 'i'))).toBeInTheDocument();
      expect(screen.getByLabelText(new RegExp(`stage ${stage} time`, 'i'))).toBeInTheDocument();
      expect(screen.getByLabelText(new RegExp(`stage ${stage} icon`, 'i'))).toBeInTheDocument();
    }

    await user.type(screen.getByLabelText(/stage 2 date/i), 'Sep 19');
    await user.type(screen.getByLabelText(/stage 4 date/i), 'Oct 10 - 18');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(savedContent().stages[1].date).toBe('Sep 19');
    expect(savedContent().stages[3].date).toBe('Oct 10 - 18');
  });

  it('offers CTA destinations as a fixed list rather than a free-text URL', async () => {
    const user = userEvent.setup();
    render(<GbLandingManager />);

    const action = screen.getByLabelText(/primary cta action/i);
    expect(action.tagName).toBe('SELECT');

    await user.selectOptions(action, 'reviews');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(savedContent().primaryCtaAction).toBe('reviews');
  });

  it('surfaces a save failure instead of reporting success', async () => {
    const user = userEvent.setup();
    save.mockRejectedValue(new Error('permission denied'));
    render(<GbLandingManager />);

    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/permission denied/i);
  });

  it('reports the read error while still allowing edits on the defaults', () => {
    state.error = 'Failed to load the Group Buy landing settings';

    render(<GbLandingManager />);

    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i);
    expect(screen.getByLabelText(/main headline/i)).toBeInTheDocument();
  });
});
