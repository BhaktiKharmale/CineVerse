import React from "react";

interface AppErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[AppErrorBoundary] Uncaught error", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#050509] px-6 text-center text-white">
          <div className="max-w-lg rounded-3xl border border-[#1f1f25]/70 bg-[#111118] p-8 shadow-xl">
            <h1 className="text-2xl font-semibold text-[#f6c800]">Something went wrong</h1>
            <p className="mt-3 text-sm text-gray-300">
              {this.state.error?.message || "The application encountered an unexpected error."}
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#f6c800] to-[#ff9d1b] px-6 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-[#050509] transition hover:opacity-90"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;

