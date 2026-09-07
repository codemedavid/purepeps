import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import COA from './COA';
import { loadPdf } from '../lib/pdf';

// pdf.js is stubbed: jsdom cannot rasterise a PDF, and what these tests care
// about is that the report opens inside Pure Peps at all.
vi.mock('../lib/pdf', () => ({ loadPdf: vi.fn() }));

// A fresh object literal per call would give the hook a new identity on every
// render and spin the component forever; keep one stable value.
const PAGE_SETTING = { coaPageEnabled: true, loading: false };
vi.mock('../hooks/useCOAPageSetting', () => ({
  useCOAPageSetting: () => PAGE_SETTING,
}));

const reports: unknown[] = [];
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: reports, error: null }),
      }),
    }),
  },
}));

const mockLoadPdf = vi.mocked(loadPdf);
const renderPage = vi.fn().mockResolvedValue(undefined);

const PDF_URL = 'https://ik.imagekit.io/vmgfsnjfe/coa/retatrutide-batch-7.pdf';
const IMAGE_URL = 'https://ik.imagekit.io/vmgfsnjfe/coa/bpc-157-batch-3.jpg';

function coaReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coa-1',
    product_name: 'Retatrutide',
    batch: 'B-7',
    test_date: '2026-01-15',
    purity_percentage: 99.4,
    quantity: '10mg',
    task_number: 'T-4821',
    verification_key: 'key-1',
    image_url: PDF_URL,
    featured: true,
    laboratory: 'Janoshik',
    ...overrides,
  };
}

function seed(...rows: unknown[]) {
  reports.length = 0;
  reports.push(...rows);
}

async function openFirstReport() {
  render(<COA />);
  await userEvent.click(await screen.findByRole('button', { name: /view full report/i }));
}

describe('COA lab reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderPage.mockResolvedValue(undefined);
    mockLoadPdf.mockResolvedValue({ pageCount: 2, renderPage });
    seed(coaReport());
  });

  // --- The report has to stay on our own site ---

  it('draws a PDF report page by page inside the site', async () => {
    await openFirstReport();

    const pages = await screen.findAllByRole('img', { name: /^Page \d+ of 2$/ });
    expect(pages).toHaveLength(2);
    expect(mockLoadPdf).toHaveBeenCalledWith(PDF_URL);
  });

  it('never hands a PDF report to the browser as a framed CDN document', async () => {
    await openFirstReport();
    await screen.findAllByRole('img', { name: /^Page \d+ of 2$/ });

    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('embed, object')).toBeNull();
  });

  it('offers no route off to ImageKit from an open report', async () => {
    await openFirstReport();
    await screen.findAllByRole('img', { name: /^Page \d+ of 2$/ });

    const offsite = screen
      .queryAllByRole('link')
      .filter((link) => (link.getAttribute('href') ?? '').includes('ik.imagekit.io'));
    expect(offsite).toEqual([]);
    expect(screen.queryByText(/open .*new tab/i)).not.toBeInTheDocument();
  });

  it('never asks the customer to download the report to read it', async () => {
    await openFirstReport();
    await screen.findAllByRole('img', { name: /^Page \d+ of 2$/ });

    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(screen.queryByText(/ik-attachment/i)).not.toBeInTheDocument();
  });

  // --- Image reports were already in-site; keep them that way ---

  it('shows an image report in the page rather than linking to the file', async () => {
    seed(coaReport({ image_url: IMAGE_URL }));

    await openFirstReport();

    // Exact name: the card thumbnail's alt is "<product> Certificate of Analysis".
    const full = await screen.findByRole('img', { name: 'Certificate of Analysis' });
    expect(full).toHaveAttribute('src', IMAGE_URL);
    expect(mockLoadPdf).not.toHaveBeenCalled();
  });

  // --- Honest failure, still on-site ---

  it('explains a report it cannot draw instead of bouncing the customer to the CDN', async () => {
    mockLoadPdf.mockRejectedValue(new Error('network down'));

    await openFirstReport();

    expect(await screen.findByText(/couldn't be displayed/i)).toBeInTheDocument();
    const offsite = screen
      .queryAllByRole('link')
      .filter((link) => (link.getAttribute('href') ?? '').includes('ik.imagekit.io'));
    expect(offsite).toEqual([]);
  });
});
