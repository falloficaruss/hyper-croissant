import { useAppStore } from "../../stores/appStore";

/**
 * Dismissible banner that surfaces uncaught async errors and warns when
 * the app runs in a plain browser without the Tauri backend.
 */
export function StatusBanner() {
  const backendAvailable = useAppStore((s) => s.backendAvailable);
  const globalError = useAppStore((s) => s.globalError);
  const clearGlobalError = useAppStore((s) => s.clearGlobalError);

  const errorText = globalError?.trim();
  const showBackendWarning = !backendAvailable;

  if (!errorText && !showBackendWarning) return null;

  return (
    <div className="status-banner" role="alert">
      <div className="status-banner-content">
        {showBackendWarning && (
          <div className="status-banner-warning">
            <strong>Backend unavailable.</strong> Running without the Tauri
            desktop shell — engine analysis, game library, and LLM features are
            disabled.
          </div>
        )}
        {errorText && (
          <div className="status-banner-error">
            <strong>Unexpected error:</strong> {errorText}
          </div>
        )}
      </div>
      {errorText && (
        <button
          type="button"
          className="status-banner-dismiss"
          onClick={clearGlobalError}
          title="Dismiss"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}