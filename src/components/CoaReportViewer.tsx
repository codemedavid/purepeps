import React, { useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { usePdfPages } from '../hooks/usePdfPages';
import { isPdfFile } from '../utils/protocolFiles';

interface CoaReportViewerProps {
  /** ImageKit URL of the certificate — either an image or a PDF. */
  fileUrl: string;
  onClose: () => void;
}

/**
 * Reads a certificate of analysis inside Pure Peps. Previously a PDF report was
 * dropped into an <iframe> aimed at the raw ImageKit URL, with an "Open in new
 * tab" link beside it: mobile Safari and Chrome on Android refuse to draw a
 * framed cross-origin PDF, so customers met a blank box or a download prompt
 * and ended up on a bare CDN page with no way back. The pages are rasterised
 * here instead, and nothing links off-site.
 */
const CoaReportViewer: React.FC<CoaReportViewerProps> = ({ fileUrl, onClose }) => {
  const isPdf = isPdfFile(fileUrl);
  const { status, pageCount, registerCanvas } = usePdfPages(fileUrl);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid="coa-viewer-backdrop"
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-2 md:p-4"
      onClick={onClose}
    >
      <div className="relative w-full max-w-5xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-10 md:-top-12 right-0 bg-white/95 hover:bg-white text-gray-800 rounded-full p-2 md:p-2.5 transition-all shadow-lg"
        >
          <X className="w-5 h-5 md:w-6 md:h-6" />
        </button>

        {isPdf ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Certificate of Analysis"
            onClick={(event) => event.stopPropagation()}
            className="bg-white rounded-2xl md:rounded-3xl shadow-2xl overflow-y-auto max-h-[85vh] p-3 md:p-5"
          >
            {status === 'loading' && (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                <p className="text-sm text-gray-500">Loading report...</p>
              </div>
            )}

            {status === 'ready' && (
              <div className="space-y-4">
                {Array.from({ length: pageCount }, (_, index) => (
                  <canvas
                    key={index}
                    ref={registerCanvas(index)}
                    role="img"
                    aria-label={`Page ${index + 1} of ${pageCount}`}
                    className="w-full rounded-xl shadow-sm bg-white"
                  />
                ))}
              </div>
            )}

            {(status === 'error' || status === 'unsupported') && (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
                <AlertCircle className="w-8 h-8 text-amber-500" />
                <p className="text-sm font-medium text-gray-800">
                  This report couldn't be displayed here.
                </p>
                <p className="text-xs text-gray-500">
                  Please try again in a moment, or message us and we'll walk you through it.
                </p>
              </div>
            )}
          </div>
        ) : (
          <img
            src={fileUrl}
            alt="Certificate of Analysis"
            className="w-full h-auto rounded-2xl md:rounded-3xl shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        )}
      </div>
    </div>
  );
};

export default CoaReportViewer;
