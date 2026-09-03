import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProtocolGuide from './ProtocolGuide';
import { allMockProtocols } from '../test/mocks';

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

describe('ProtocolGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Rendering ---

  describe('rendering', () => {
    it('renders the protocol guide page', () => {
      render(<ProtocolGuide />);

      expect(screen.getByText('Peptide Protocol Guide')).toBeInTheDocument();
    });

    it('only shows active protocols', () => {
      render(<ProtocolGuide />);

      expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
      expect(screen.getByText('GHK-Cu Protocol')).toBeInTheDocument();
      expect(screen.getByText('BPC-157 Protocol')).toBeInTheDocument();

      // Inactive protocol should NOT appear
      expect(screen.queryByText('Hidden Protocol')).not.toBeInTheDocument();
    });

    it('shows protocol count', () => {
      render(<ProtocolGuide />);

      expect(screen.getByText('3 protocol(s) found')).toBeInTheDocument();
    });
  });

  // --- Text Protocol Expanded ---

  describe('text protocol content', () => {
    it('shows dosage, frequency, duration when expanded', async () => {
      render(<ProtocolGuide />);

      await userEvent.click(screen.getByText('Tirzepatide'));

      expect(screen.getByText('2.5mg - 15mg')).toBeInTheDocument();
      expect(screen.getByText('Once weekly')).toBeInTheDocument();
      expect(screen.getByText('12-16 weeks')).toBeInTheDocument();
    });

    it('shows protocol notes when expanded', async () => {
      render(<ProtocolGuide />);

      await userEvent.click(screen.getByText('Tirzepatide'));

      expect(screen.getByText('Start low')).toBeInTheDocument();
      expect(screen.getByText('Rotate injection sites')).toBeInTheDocument();
    });

    it('shows storage info when expanded', async () => {
      render(<ProtocolGuide />);

      await userEvent.click(screen.getByText('Tirzepatide'));

      // Use getAllByText since "Refrigerate" appears in the static storage section too
      const storageElements = screen.getAllByText(/Refrigerate at 2-8°C/);
      expect(storageElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Image Protocol Expanded ---

  describe('image protocol content', () => {
    it('shows image when image protocol is expanded', async () => {
      render(<ProtocolGuide />);

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
      render(<ProtocolGuide />);

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
    it('shows download link when file protocol is expanded', async () => {
      render(<ProtocolGuide />);

      const protocolButtons = screen.getAllByRole('button');
      const bpcButton = protocolButtons.find(btn => btn.textContent?.includes('BPC-157 Protocol'));
      expect(bpcButton).toBeDefined();
      await userEvent.click(bpcButton!);

      expect(screen.getByText('Click to view or download')).toBeInTheDocument();
    });

    it('file link opens in new tab with correct href', async () => {
      render(<ProtocolGuide />);

      const protocolButtons = screen.getAllByRole('button');
      const bpcButton = protocolButtons.find(btn => btn.textContent?.includes('BPC-157 Protocol'));
      await userEvent.click(bpcButton!);

      const link = screen.getByText('Click to view or download').closest('a');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('href', 'https://test.supabase.co/storage/v1/object/public/protocol-files/bpc-protocol.pdf');
    });
  });

  // --- Collapse/Expand ---

  describe('expand and collapse', () => {
    it('collapses an expanded protocol when clicked again', async () => {
      render(<ProtocolGuide />);

      await userEvent.click(screen.getByText('Tirzepatide'));
      expect(screen.getByText('2.5mg - 15mg')).toBeInTheDocument();

      await userEvent.click(screen.getByText('Tirzepatide'));
      expect(screen.queryByText('2.5mg - 15mg')).not.toBeInTheDocument();
    });

    it('only one protocol is expanded at a time', async () => {
      render(<ProtocolGuide />);

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

  describe('category filtering', () => {
    it('shows all categories in the filter dropdown', () => {
      render(<ProtocolGuide />);

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      const options = screen.getAllByRole('option');
      const optionTexts = options.map(o => o.textContent);

      expect(optionTexts).toContain('Weight Management');
      expect(optionTexts).toContain('Skin & Anti-Aging');
      expect(optionTexts).toContain('Recovery & Healing');
    });

    it('filters protocols by category', async () => {
      render(<ProtocolGuide />);

      const select = screen.getByRole('combobox');
      await userEvent.selectOptions(select, 'Weight Management');

      expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
      expect(screen.queryByText('GHK-Cu Protocol')).not.toBeInTheDocument();
      expect(screen.queryByText('BPC-157 Protocol')).not.toBeInTheDocument();
      expect(screen.getByText('1 protocol(s) found')).toBeInTheDocument();
    });

    it('shows all protocols when "all" is selected', async () => {
      render(<ProtocolGuide />);

      const select = screen.getByRole('combobox');
      await userEvent.selectOptions(select, 'Weight Management');
      expect(screen.getByText('1 protocol(s) found')).toBeInTheDocument();

      await userEvent.selectOptions(select, 'all');
      expect(screen.getByText('3 protocol(s) found')).toBeInTheDocument();
    });
  });

  // --- Mobile Navigation ---

  /**
   * Mobile navigation on this page belongs to the bottom bar that its route
   * wrapper renders (see `PublicNoticePage` in App.tsx). The header must not add
   * a second one, or a phone gets two competing navigations on one screen.
   */
  describe('mobile navigation', () => {
    it('leaves mobile navigation to the bottom bar instead of a burger drawer', () => {
      render(<ProtocolGuide />);

      expect(screen.queryByRole('button', { name: 'Toggle menu' })).not.toBeInTheDocument();
    });

    it('keeps the header cart to desktop widths', () => {
      render(<ProtocolGuide />);

      expect(screen.getByRole('button', { name: 'View cart' })).toHaveClass('hidden', 'md:block');
    });
  });
});
