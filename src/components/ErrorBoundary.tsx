import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary] Caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
          <p className="text-5xl">⚠️</p>
          <h1 className="text-2xl font-bold text-gray-800">Something went wrong</h1>
          <p className="text-sm text-gray-500 max-w-xs">
            This page hit an unexpected error. Try reloading — if it
            keeps happening, contact your administrator.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
