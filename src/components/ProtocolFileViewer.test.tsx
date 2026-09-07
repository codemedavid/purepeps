import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProtocolFileViewer from './ProtocolFileViewer';
import { loadPdf } from '../lib/pdf';

// pdf.js is mocked everywhere: jsdom has no canvas renderer, and the point of
// these tests is the viewer's behaviour, not the pixels pdf.js paints.
vi.mock('../lib/pdf', () => ({ loadPdf: vi.fn() }));

const mockLoadPdf = vi.mocked(loadPdf);

const PDF_URL = 'https://ik.imagekit.io/vmgfsnjfe/protocol-files/bpc.pdf';

const renderPage = vi.fn().mockResolvedValue(undefined);

function stubDocument(pageCount: number) {
  mockLoadPdf.mockResolvedValue({ pageCount, renderPage });
}

describe('ProtocolFileViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderPage.mockResolvedValue(undefined);
    stubDocument(2);
  });

  // --- Shell ---

  it('presents the protocol as a dialog titled with its name', async () => {
    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'BPC-157 Protocol' })).toBeInTheDocument();
  });

  it('shows a loading state until the document arrives', async () => {
    let release: (doc: { pageCount: number; renderPage: typeof renderPage }) => void = () => { };
    mockLoadPdf.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={vi.fn()} />);

    expect(screen.getByText(/loading protocol/i)).toBeInTheDocument();

    release({ pageCount: 1, renderPage });
    await waitFor(() => expect(screen.queryByText(/loading protocol/i)).not.toBeInTheDocument());
  });

  // --- Rendering the document in-site ---

  it('draws one page per page of the PDF', async () => {
    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={vi.fn()} />);

    const pages = await screen.findAllByRole('img');
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveAccessibleName('Page 1 of 2');
    expect(pages[1]).toHaveAccessibleName('Page 2 of 2');
  });

  it('hands each page canvas to the renderer', async () => {
    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={vi.fn()} />);

    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));
    expect(renderPage.mock.calls[0][0]).toBe(1);
    expect(renderPage.mock.calls[0][1]).toBeInstanceOf(HTMLCanvasElement);
    expect(renderPage.mock.calls[1][0]).toBe(2);
  });

  it('loads the document from the protocol file URL', async () => {
    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={vi.fn()} />);

    await waitFor(() => expect(mockLoadPdf).toHaveBeenCalledWith(PDF_URL));
  });

  // --- The guide has to stay on our own site ---

  it('offers no download and no route off to the file host', async () => {
    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={vi.fn()} />);
    await screen.findAllByRole('img', { name: /^Page \d+ of 2$/ });

    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(screen.queryByText(/open .*new tab/i)).not.toBeInTheDocument();
    expect(
      screen.queryAllByRole('link').filter((link) =>
        (link.getAttribute('href') ?? '').includes('ik.imagekit.io'),
      ),
    ).toEqual([]);
  });

  it('never frames the file straight from the CDN', async () => {
    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={vi.fn()} />);
    await screen.findAllByRole('img', { name: /^Page \d+ of 2$/ });

    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('embed, object')).toBeNull();
  });

  // --- Closing ---

  it('closes on the close button', async () => {
    const onClose = vi.fn();
    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={onClose} />);

    await userEvent.click(await screen.findByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={onClose} />);
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={onClose} />);

    await userEvent.click(await screen.findByTestId('protocol-viewer-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when the document itself is clicked', async () => {
    const onClose = vi.fn();
    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={onClose} />);

    await userEvent.click(await screen.findByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();
  });

  // --- Honest failure states ---

  it('explains a failed render without bouncing the reader to the CDN', async () => {
    mockLoadPdf.mockRejectedValue(new Error('network down'));

    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={PDF_URL} onClose={vi.fn()} />);

    expect(await screen.findByText(/couldn't be displayed/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
    expect(
      screen.queryAllByRole('link').filter((link) =>
        (link.getAttribute('href') ?? '').includes('ik.imagekit.io'),
      ),
    ).toEqual([]);
  });

  it('never leaves a blank box for a file type it cannot draw', async () => {
    const docUrl = 'https://ik.imagekit.io/vmgfsnjfe/protocol-files/bpc.docx';

    render(<ProtocolFileViewer name="BPC-157 Protocol" fileUrl={docUrl} onClose={vi.fn()} />);

    expect(await screen.findByText(/preview isn't available/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
    expect(mockLoadPdf).not.toHaveBeenCalled();
  });
});
