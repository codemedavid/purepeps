// Thin adapter over pdf.js. It exists so the viewer can `await import()` this
// module — keeping ~350kB of PDF machinery out of the main bundle until a
// customer actually opens a protocol file — and so component tests can mock a
// single seam instead of stubbing pdf.js itself.
//
// The legacy build is used deliberately: it ships the wider browser support
// matrix, which matters for the older Android and iOS phones our customers
// browse on.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

// Retina phones report 3x; rendering at that density triples canvas memory for
// a barely visible gain, so cap it.
const MAX_PIXEL_RATIO = 2;

export interface LoadedPdf {
  pageCount: number;
  /** Draws one page into `canvas`, sized to `targetWidth` CSS pixels. */
  renderPage(pageNumber: number, canvas: HTMLCanvasElement, targetWidth: number): Promise<void>;
}

export async function loadPdf(url: string): Promise<LoadedPdf> {
  const document = await pdfjs.getDocument({ url }).promise;

  return {
    pageCount: document.numPages,
    async renderPage(pageNumber, canvas, targetWidth) {
      const page = await document.getPage(pageNumber);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');

      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const naturalWidth = page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale: (targetWidth / naturalWidth) * pixelRatio });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';

      await page.render({ canvasContext: context, viewport }).promise;
    },
  };
}
