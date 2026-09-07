import React, { useEffect } from 'react';
import { X, FileText, AlertCircle } from 'lucide-react';
import { usePdfPages } from '../hooks/usePdfPages';

interface ProtocolFileViewerProps {
    /** Protocol name, used as the dialog title. */
    name: string;
    fileUrl: string;
    onClose: () => void;
}

/**
 * Reads a protocol's attached file inside the site. Previously the card linked
 * straight to the ImageKit URL, which threw the customer out of Pure Peps onto
 * a bare CDN page with no way back.
 */
const ProtocolFileViewer: React.FC<ProtocolFileViewerProps> = ({ name, fileUrl, onClose }) => {
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
            data-testid="protocol-viewer-backdrop"
            className="fixed inset-0 bg-charcoal-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 z-50"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={name}
                onClick={(event) => event.stopPropagation()}
                className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
                {/* Title bar */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-brand-100">
                    <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-rose-500" />
                    </div>
                    <h2 className="font-heading text-base sm:text-lg font-semibold text-charcoal-900 flex-1 truncate">
                        {name}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-charcoal-400 hover:text-charcoal-700 hover:bg-brand-50 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Document */}
                <div className="flex-1 overflow-y-auto bg-brand-50/40 px-3 sm:px-5 py-4">
                    {status === 'loading' && (
                        <div className="flex flex-col items-center justify-center gap-3 py-16">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
                            <p className="text-sm text-charcoal-500">Loading protocol...</p>
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

                    {status === 'error' && (
                        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                            <AlertCircle className="w-8 h-8 text-amber-500" />
                            <p className="text-sm font-medium text-charcoal-800">
                                This protocol couldn't be displayed here.
                            </p>
                            <p className="text-xs text-charcoal-500">
                                Please try again in a moment, or message us and we'll walk you through it.
                            </p>
                        </div>
                    )}

                    {status === 'unsupported' && (
                        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                            <FileText className="w-8 h-8 text-charcoal-300" />
                            <p className="text-sm font-medium text-charcoal-800">
                                Preview isn't available for this file type.
                            </p>
                            <p className="text-xs text-charcoal-500">
                                Message us and we'll walk you through this protocol.
                            </p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default ProtocolFileViewer;
