import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

// Flag key used to ensure we only force a single auto-reload per stale-chunk
// error, so a genuinely broken chunk can't trap the user in a reload loop.
const RELOAD_FLAG = 'pp-chunk-reload';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Returns true when the error looks like a failed dynamic import (lazy chunk).
 * This happens when a user holds a stale index.html after a new deploy and the
 * hashed chunk filename it references no longer exists on the server.
 */
const isChunkLoadError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Loading chunk [\d]+ failed/i.test(message) ||
    /dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message)
  );
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // A stale-chunk error is recoverable: force-reload once to fetch fresh
    // assets. The session flag prevents an infinite reload loop if the chunk
    // is genuinely missing on the server.
    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
      return;
    }

    console.error('Unhandled UI error:', error, info.componentStack);
  }

  handleReload = (): void => {
    sessionStorage.removeItem(RELOAD_FLAG);
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-br from-sky-400 to-blue-500 rounded-2xl flex items-center justify-center">
            <RefreshCw className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Something went wrong</h1>
          <p className="text-gray-600 mb-6">
            This page failed to load. Refreshing usually fixes it.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="px-6 py-2.5 bg-sky-500 text-white rounded-xl font-medium hover:bg-sky-600 transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
