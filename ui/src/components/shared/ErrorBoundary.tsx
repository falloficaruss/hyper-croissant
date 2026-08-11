import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryVariant = "full" | "compact";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Section name shown in the compact fallback, e.g. "Analysis panel". */
  label?: string;
  /** full = app-level page; compact = isolated sidebar panel. */
  variant?: ErrorBoundaryVariant;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error ?? "Unknown error");
}

/**
 * Catches render errors in its subtree so a crash in one panel
 * doesn't blank the whole app.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, message: errorMessage(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Keep the real error available in the console for debugging.
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, message: "" });
  };

  render(): ReactNode {
    const { children, label, variant = "full" } = this.props;
    if (!this.state.hasError) return children;

    if (variant === "compact") {
      return (
        <div className="error-compact" role="alert">
          <div className="error-compact-title">
            {label ? `${label} crashed` : "Panel crashed"}
          </div>
          <div className="error-compact-message">{this.state.message}</div>
          <button
            type="button"
            className="error-compact-reload"
            onClick={this.handleReset}
          >
            Try again
          </button>
        </div>
      );
    }

    return (
      <div className="error-page" role="alert">
        <div className="error-page-card">
          <h1 className="error-page-title">Something went wrong</h1>
          <p className="error-page-text">
            Hyper Croissant hit an unexpected error. Reload the app to
            continue — your games and settings are saved.
          </p>
          <details className="error-page-details">
            <summary>Error details</summary>
            <pre className="error-page-message">{this.state.message}</pre>
          </details>
          <div className="error-page-actions">
            <button
              type="button"
              className="error-page-reload"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
            <button
              type="button"
              className="error-page-reset"
              onClick={this.handleReset}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
