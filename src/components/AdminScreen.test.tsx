import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminScreen from './AdminScreen';

/**
 * The shared frame every admin view sits in: one eyebrow, one Playfair title,
 * an optional description, an optional way back, and the view's own panel.
 *
 * Before this existed each branch of AdminDashboard invented its own container
 * width, background and back link, so no two admin screens announced themselves
 * the same way.
 */
describe('AdminScreen', () => {
  it('titles the screen with a single level-one heading', () => {
    render(
      <AdminScreen title="Orders">
        <p>panel</p>
      </AdminScreen>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Orders' })).toBeInTheDocument();
  });

  it('brands every screen with the same eyebrow', () => {
    render(
      <AdminScreen title="Orders">
        <p>panel</p>
      </AdminScreen>,
    );

    expect(screen.getByText('Pure Peps Admin')).toBeInTheDocument();
  });

  it('renders the description when one is given', () => {
    render(
      <AdminScreen title="Orders" description="Every order in the current batch.">
        <p>panel</p>
      </AdminScreen>,
    );

    expect(screen.getByText('Every order in the current batch.')).toBeInTheDocument();
  });

  it('renders the panel it wraps', () => {
    render(
      <AdminScreen title="Orders">
        <p>panel contents</p>
      </AdminScreen>,
    );

    expect(screen.getByText('panel contents')).toBeInTheDocument();
  });

  it('offers a way back when the caller can handle it', async () => {
    const onBack = vi.fn();
    render(
      <AdminScreen title="Orders" onBack={onBack}>
        <p>panel</p>
      </AdminScreen>,
    );

    await userEvent.click(screen.getByRole('button', { name: /back to dashboard/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('omits the back button on a screen that cannot go back', () => {
    render(
      <AdminScreen title="Orders">
        <p>panel</p>
      </AdminScreen>,
    );

    expect(screen.queryByRole('button', { name: /back to dashboard/i })).not.toBeInTheDocument();
  });
});
