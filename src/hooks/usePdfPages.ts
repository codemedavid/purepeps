import { useEffect, useRef, useState } from 'react';
import { isPdfFile } from '../utils/protocolFiles';
import type { LoadedPdf } from '../lib/pdf';

export type PdfStatus = 'loading' | 'ready' | 'error' | 'unsupported';

// jsdom and very narrow phones both report a 0px container before layout
// settles; never ask pdf.js to rasterise nothing.
const MIN_RENDER_WIDTH = 320;

export interface PdfPages {
  status: PdfStatus;
  pageCount: number;
  /** Ref callback for the canvas that should hold page `index + 1`. */
  registerCanvas: (index: number) => (element: HTMLCanvasElement | null) => void;
}

/**
 * Loads a PDF and paints every page into a caller-supplied canvas, so a
 * document can be read inside Pure Peps instead of being framed from the CDN
 * or pushed at the customer as a download. Shared by the protocol viewer and
 * the lab-report modal; each owns its own chrome and wording.
 */
export function usePdfPages(fileUrl: string): PdfPages {
  const canPreview = isPdfFile(fileUrl);
  const [status, setStatus] = useState<PdfStatus>(canPreview ? 'loading' : 'unsupported');
  const [pageCount, setPageCount] = useState(0);
  const documentRef = useRef<LoadedPdf | null>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);

  // Fetch the document. pdf.js is imported lazily so pages that never open a
  // file keep their current weight.
  useEffect(() => {
    setStatus(canPreview ? 'loading' : 'unsupported');
    setPageCount(0);
    documentRef.current = null;
    canvasRefs.current = [];

    if (!canPreview) return;

    let cancelled = false;

    (async () => {
      try {
        const { loadPdf } = await import('../lib/pdf');
        const document = await loadPdf(fileUrl);
        if (cancelled) return;

        documentRef.current = document;
        setPageCount(document.pageCount);
        setStatus('ready');
      } catch (error) {
        console.error('Failed to load PDF:', error);
        if (!cancelled) setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [fileUrl, canPreview]);

  // Draw the pages once the canvases exist.
  useEffect(() => {
    const document = documentRef.current;
    if (status !== 'ready' || !document) return;

    let cancelled = false;

    (async () => {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        if (cancelled) return;

        const canvas = canvasRefs.current[pageNumber - 1];
        if (!canvas) continue;

        try {
          const width = Math.max(canvas.parentElement?.clientWidth ?? 0, MIN_RENDER_WIDTH);
          await document.renderPage(pageNumber, canvas, width);
        } catch (error) {
          console.error(`Failed to render PDF page ${pageNumber}:`, error);
          if (!cancelled) setStatus('error');
          return;
        }
      }
    })();

    return () => { cancelled = true; };
  }, [status, pageCount]);

  const registerCanvas = (index: number) => (element: HTMLCanvasElement | null) => {
    canvasRefs.current[index] = element;
  };

  return { status, pageCount, registerCanvas };
}
