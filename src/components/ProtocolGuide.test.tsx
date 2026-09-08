import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ProtocolGuide from './ProtocolGuide';
import { allMockProtocols, mockFileProtocol } from '../test/mocks';

// Mock useProtocols
vi.mock('../hooks/useProtocols', () => ({
  useProtocols: () => ({
    protocols: allMockProtocols,
    loading: false,
  }),
}));

// Mock useCart
vi.mock('../hooks/useCart', () => ({
  useCart: () => ({
    cartItems: [],
  }),
}));

// Footer is stubbed to keep these tests focused; Header is deliberately real so
// the page's mobile-navigation contract is exercised rather than mocked away.
vi.mock('./Footer', () => ({
  default: () => <div data-testid="footer">Footer</div>,
}));

// pdf.js is stubbed: jsdom cannot rasterise a PDF, and what matters here is
// that the file opens inside the page at all.
vi.mock('../lib/pdf', () => ({
  loadPdf: vi.fn().mockResolvedValue({ pageCount: 1, renderPage: vi.fn() }),
}));

// ProtocolGuide navigates with the router (its header cart opens the storefront
// cart), and the app always renders it inside one.
const renderGuide = () => render(<ProtocolGuide />, { wrapper: MemoryRouter });

describe('ProtocolGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Rendering ---

  describe('rendering', () => {
    it('renders the protocol guide page', () => {
      renderGuide();

      expect(screen.getByText('Peptide Protocol Guide')).toBeInTheDocument();
    });

    it('only shows active protocols', () => {
      renderGuide();

      expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
      expect(screen.getByText('GHK-Cu Protocol')).toBeInTheDocument();
      expect(screen.getByText('BPC-157 Protocol')).toBeInTheDocument();

      // Inactive protocol should NOT appear
      expect(screen.queryByText('Hidden Protocol')).not.toBeInTheDocument();
    });

    it('shows protocol count', () => {
      renderGuide();

      expect(screen.getByText('3 protocol(s) found')).toBeInTheDocument();
    });
  });

  // --- Text Protocol Expanded ---

  describe('text protocol content', () => {
    it('shows dosage, frequency, duration when expanded', async () => {
      renderGuide();

      await userEvent.click(screen.getByText('Tirzepatide'));

      expect(screen.getByText('2.5mg - 15mg')).toBeInTheDocument();
      expect(screen.getByText('Once weekly')).toBeInTheDocument();
      expect(screen.getByText('12-16 weeks')).toBeInTheDocument();
    });

    it('shows protocol notes when expanded', async () => {
      renderGuide();

      await userEvent.click(screen.getByText('Tirzepatide'));

      expect(screen.getByText('Start low')).toBeInTheDocument();
      expect(screen.getByText('Rotate injection sites')).toBeInTheDocument();
    });

    it('shows storage info when expanded', async () => {
      renderGuide();

      await userEvent.click(screen.getByText('Tirzepatide'));

      // Use getAllByText since "Refrigerate" appears in the static storage section too
      const storageElements = screen.getAllByText(/Refrigerate at 2-8°C/);
      expect(storageElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Image Protocol Expanded ---

  describe('image protocol content', () => {
    it('shows image when image protocol is expanded', async () => {
      renderGuide();

      // Click the protocol name button to expand
      const protocolButtons = screen.getAllByRole('button');
      const ghkButton = protocolButtons.find(btn => btn.textContent?.includes('GHK-Cu Protocol'));
      expect(ghkButton).toBeDefined();
      await userEvent.click(ghkButton!);

      const img = screen.getByAltText('GHK-Cu Protocol protocol');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://test.supabase.co/storage/v1/object/public/protocol-files/ghk-protocol.png');
    });

    it('does NOT show text dosage fields for image protocol', async () => {
      renderGuide();

      const protocolButtons = screen.getAllByRole('button');
      const ghkButton = protocolButtons.find(btn => btn.textContent?.includes('GHK-Cu Protocol'));
      await userEvent.click(ghkButton!);

      // Image protocol should show image, not dosage card
      const img = screen.getByAltText('GHK-Cu Protocol protocol');
      expect(img).toBeInTheDocument();
    });
  });

  // --- File Protocol Expanded ---

  describe('file protocol content', () => {
    it('shows the file card when a file protocol is expanded', async () => {
      renderGuide();

      const protocolButtons = screen.getAllByRole('button');
      const bpcButton = protocolButtons.find(btn => btn.textContent?.includes('BPC-157 Protocol'));
      expect(bpcButton).toBeDefined();
      await userEvent.click(bpcButton!);

      expect(screen.getByText('Click to view')).toBeInTheDocument();
    });

    it('keeps the customer on Pure Peps instead of linking out to the file host', async () => {
      renderGuide();

      const protocolButtons = screen.getAllByRole('button');
      const bpcButton = protocolButtons.find(btn => btn.textContent?.includes('BPC-157 Protocol'));
      await userEvent.click(bpcButton!);

      const card = screen.getByText('Click to view').closest('a');
      expect(card).toBeNull();
      expect(
        document.querySelector(`a[href="${mockFileProtocol.file_url}"]`),
      ).toBeNull();
    });

    it('opens the file in an in-site viewer when the card is clicked', async () => {
      renderGuide();

      const protocolButtons = screen.getAllByRole('button');
      const bpcButton = protocolButtons.find(btn => btn.textContent?.includes('BPC-157 Protocol'));
      await userEvent.click(bpcButton!);

      await userEvent.click(screen.getByRole('button', { name: /click to view/i }));

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('BPC-157 Protocol');
    });

    it('returns to the protocol list when the viewer is closed', async () => {
      renderGuide();

      const protocolButtons = screen.getAllByRole('button');
      const bpcButton = protocolButtons.find(btn => btn.textContent?.includes('BPC-157 Protocol'));
      await userEvent.click(bpcButton!);
      await userEvent.click(screen.getByRole('button', { name: /click to view/i }));
      await screen.findByRole('dialog');

      await userEvent.click(screen.getByRole('button', { name: /close/i }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Click to view')).toBeInTheDocument();
    });
  });

  // --- Collapse/Expand ---

  describe('expand and collapse', () => {
    it('collapses an expanded protocol when clicked again', async () => {
      renderGuide();

      await userEvent.click(screen.getByText('Tirzepatide'));
      expect(screen.getByText('2.5mg - 15mg')).toBeInTheDocument();

      await userEvent.click(screen.getByText('Tirzepatide'));
      expect(screen.queryByText('2.5mg - 15mg')).not.toBeInTheDocument();
    });

    it('only one protocol is expanded at a time', async () => {
      renderGuide();

      // Expand Tirzepatide
      await userEvent.click(screen.getByText('Tirzepatide'));
      expect(screen.getByText('2.5mg - 15mg')).toBeInTheDocument();

      // Expand GHK-Cu via button
      const protocolButtons = screen.getAllByRole('button');
      const ghkButton = protocolButtons.find(btn => btn.textContent?.includes('GHK-Cu Protocol'));
      await userEvent.click(ghkButton!);

      // Tirzepatide should collapse
      expect(screen.queryByText('2.5mg - 15mg')).not.toBeInTheDocument();
      // GHK-Cu image should show
      expect(screen.getByAltText('GHK-Cu Protocol protocol')).toBeInTheDocument();
    });
  });

  // --- Category Filter ---

  /**
   * The dropdown is built from CANONICAL slugs, not from the raw text an admin
   * typed. The client created "Weight Loss" twice and got two options
   * ("tigdadalawa lumabas"); these tests pin the collapse that prevents it.
   */
  describe('category filtering', () => {
    it('shows one option per canonical category', () => {
      renderGuide();

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      const optionTexts = screen.getAllByRole('option').map((o) => o.textContent);

      // "Weight Management" and "Skin & Anti-Aging" fold onto the names the
      // client asked for.
      expect(optionTexts.some((text) => text?.includes('Weight Loss'))).toBe(true);
      expect(optionTexts.some((text) => text?.includes('Anti Aging'))).toBe(true);
      expect(optionTexts.some((text) => text?.includes('Recovery Healing'))).toBe(true);
    });

    it('never repeats a category, however the admin spelled it', () => {
      renderGuide();

      const slugs = screen
        .getAllByRole('option')
        .map((o) => (o as HTMLOptionElement).value);

      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('filters protocols by category', async () => {
      renderGuide();

      await userEvent.selectOptions(screen.getByRole('combobox'), 'weight-loss');

      expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
      expect(screen.queryByText('GHK-Cu Protocol')).not.toBeInTheDocument();
      expect(screen.queryByText('BPC-157 Protocol')).not.toBeInTheDocument();
      expect(screen.getByText('1 protocol(s) found')).toBeInTheDocument();
    });

    it('shows all protocols when "all" is selected', async () => {
      renderGuide();

      const select = screen.getByRole('combobox');
      await userEvent.selectOptions(select, 'weight-loss');
      expect(screen.getByText('1 protocol(s) found')).toBeInTheDocument();

      await userEvent.selectOptions(select, 'all');
      expect(screen.getByText('3 protocol(s) found')).toBeInTheDocument();
    });
  });

  // --- Search ---

  describe('search', () => {
    it('offers a search box', () => {
      renderGuide();

      expect(screen.getByRole('searchbox', { name: /search protocols/i })).toBeInTheDocument();
    });

    it('narrows the list to protocols matching the query', async () => {
      renderGuide();

      await userEvent.type(
        screen.getByRole('searchbox', { name: /search protocols/i }),
        'ghk',
      );

      expect(screen.getByText('GHK-Cu Protocol')).toBeInTheDocument();
      expect(screen.queryByText('Tirzepatide')).not.toBeInTheDocument();
      expect(screen.getByText('1 protocol(s) found')).toBeInTheDocument();
    });

    it('restores the full list when the query is cleared', async () => {
      renderGuide();

      const box = screen.getByRole('searchbox', { name: /search protocols/i });
      await userEvent.type(box, 'ghk');
      expect(screen.getByText('1 protocol(s) found')).toBeInTheDocument();

      await userEvent.clear(box);

      expect(screen.getByText('3 protocol(s) found')).toBeInTheDocument();
      expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
    });

    it('combines the search box with the category dropdown', async () => {
      renderGuide();

      await userEvent.selectOptions(screen.getByRole('combobox'), 'weight-loss');
      await userEvent.type(
        screen.getByRole('searchbox', { name: /search protocols/i }),
        'ghk',
      );

      expect(screen.getByText('0 protocol(s) found')).toBeInTheDocument();
      expect(screen.getByText(/no protocols match/i)).toBeInTheDocument();
    });

    it('says the shop has no protocols yet only when it really has none', () => {
      renderGuide();

      expect(screen.queryByText(/no protocols/i)).not.toBeInTheDocument();
    });
  });

  // --- Mobile Navigation ---

  /**
   * Mobile navigation on this page comes from BOTH the bottom bar its route
   * wrapper renders (see `PublicNoticePage` in App.tsx) and the header's burger
   * drawer.
   *
   * An earlier revision removed the burger here to avoid "two competing
   * navigations". That reasoning does not survive the numbers: the bottom bar
   * caps at six columns — Home, Shop and Cart plus at most Lab Reports, Orders
   * and Guides — so it can never reach FAQ or Customer Reviews. Without the
   * burger those pages are simply unreachable from here on a phone. The two are
   * not duplicates: the bar is the shortcut, the drawer is the full index.
   */
  describe('mobile navigation', () => {
    it('offers the burger drawer, the only route to FAQ and Reviews on a phone', () => {
      renderGuide();

      expect(screen.getByRole('button', { name: 'Toggle menu' })).toBeInTheDocument();
    });

    it('keeps that burger to small screens, where the desktop bar is hidden', () => {
      renderGuide();

      expect(screen.getByRole('button', { name: 'Toggle menu' })).toHaveClass('md:hidden');
    });

    // The cart moved into the header beside the burger and is no longer hidden
    // on phones: the bottom navigation carries Reviews now, so this is the only
    // cart entry on a small screen.
    it('shows the header cart at every width', () => {
      renderGuide();

      const cart = screen.getByRole('button', { name: 'View cart' });
      expect(cart).not.toHaveClass('hidden');
      expect(cart.className).not.toContain('md:block');
    });
  });
});
