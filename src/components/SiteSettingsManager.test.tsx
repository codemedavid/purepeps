import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SiteSettingsManager from './SiteSettingsManager';

/**
 * The three panels this screen exists for are stubbed: each owns its own suite,
 * and what matters here is which panels the screen mounts, not what they render.
 */
vi.mock('./AccessIntakeToggle', () => ({
  default: () => <div data-testid="access-intake-toggle" />,
}));

vi.mock('./GbLandingManager', () => ({
  default: () => <div data-testid="gb-landing-manager" />,
}));

vi.mock('./StorefrontNoticeManager', () => ({
  default: () => <div data-testid="storefront-notice-manager" />,
}));

/**
 * "General Site Settings" offered a site name, description, logo upload and
 * currency symbol/code. Every one of them was inert:
 *
 *  - the header renders a hardcoded `/logo.png`, never `site_logo`
 *  - `utils/currency.ts` hardcodes ₱ and PHP, never the stored currency rows
 *  - nothing outside the card itself ever read site_name or site_description
 *
 * So the card let an admin fill in fields, press Save, get "Settings saved
 * successfully!" and change nothing anywhere on the site. It was removed on the
 * client's request rather than wired up.
 */
describe('SiteSettingsManager', () => {
  it('keeps the panels that actually drive the storefront', () => {
    render(<SiteSettingsManager />);

    expect(screen.getByTestId('access-intake-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('gb-landing-manager')).toBeInTheDocument();
    expect(screen.getByTestId('storefront-notice-manager')).toBeInTheDocument();
  });

  it('no longer offers the General Site Settings card', () => {
    render(<SiteSettingsManager />);

    expect(screen.queryByText('General Site Settings')).not.toBeInTheDocument();
  });

  it("offers none of that card's inert fields", () => {
    render(<SiteSettingsManager />);

    expect(screen.queryByText(/site name/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/site description/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/currency symbol/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/currency code/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/site logo/i)).not.toBeInTheDocument();
  });

  it('has no save button that could report success without changing anything', () => {
    render(<SiteSettingsManager />);

    expect(
      screen.queryByRole('button', { name: /save general settings/i }),
    ).not.toBeInTheDocument();
  });

  it('renders without waiting on a settings read', () => {
    // The card was the only reason this screen blocked on useSiteSettings and
    // showed "Loading settings...". Without it the panels mount immediately.
    render(<SiteSettingsManager />);

    expect(screen.queryByText(/loading settings/i)).not.toBeInTheDocument();
  });
});

/**
 * The redesign turns a flat `space-y-8` stack of three look-alike cards into a
 * navigable settings screen: a titled header, a section rail, and one labelled
 * landmark per panel.
 *
 * The panels stay mounted (the rail scroll-anchors rather than tab-switching),
 * so the guarantees above about which panels exist still hold.
 */
describe('SiteSettingsManager layout', () => {
  it('titles the screen so the header is not just three anonymous cards', () => {
    render(<SiteSettingsManager />);

    expect(screen.getByRole('heading', { level: 1, name: /settings/i })).toBeInTheDocument();
  });

  it('lists every section in a labelled rail', () => {
    render(<SiteSettingsManager />);

    const rail = screen.getByRole('navigation', { name: /settings sections/i });

    expect(within(rail).getAllByRole('link')).toHaveLength(3);
  });

  it('points each rail link at the section it names', () => {
    render(<SiteSettingsManager />);

    const rail = screen.getByRole('navigation', { name: /settings sections/i });

    expect(within(rail).getByRole('link', { name: /access/i })).toHaveAttribute(
      'href',
      '#settings-access',
    );
    expect(within(rail).getByRole('link', { name: /homepage/i })).toHaveAttribute(
      'href',
      '#settings-homepage',
    );
    expect(within(rail).getByRole('link', { name: /notices/i })).toHaveAttribute(
      'href',
      '#settings-notices',
    );
  });

  it('wraps each panel in a landmark named after the panel', () => {
    render(<SiteSettingsManager />);

    expect(screen.getByRole('region', { name: /new access requests/i })).toContainElement(
      screen.getByTestId('access-intake-toggle'),
    );
    expect(screen.getByRole('region', { name: /group buy landing/i })).toContainElement(
      screen.getByTestId('gb-landing-manager'),
    );
    expect(screen.getByRole('region', { name: /notice manager/i })).toContainElement(
      screen.getByTestId('storefront-notice-manager'),
    );
  });

  it('gives each landmark the id its rail link targets', () => {
    render(<SiteSettingsManager />);

    expect(screen.getByRole('region', { name: /new access requests/i })).toHaveAttribute(
      'id',
      'settings-access',
    );
    expect(screen.getByRole('region', { name: /group buy landing/i })).toHaveAttribute(
      'id',
      'settings-homepage',
    );
    expect(screen.getByRole('region', { name: /notice manager/i })).toHaveAttribute(
      'id',
      'settings-notices',
    );
  });
});
