import { useAppStore } from "../stores/appStore";

function errorMessageFrom(event: ErrorEvent): string {
  if (event.error instanceof Error && event.error.message) {
    return event.error.message;
  }
  return event.message || "Unknown script error";
}

/** Install window-level capture of uncaught errors and rejections. */
export function setupGlobalErrorCapture(): void {
  window.addEventListener("error", (event) => {
    useAppStore.getState().reportGlobalError(errorMessageFrom(event));
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error && reason.message
        ? reason.message
        : String(reason ?? "Unknown rejection");
    useAppStore.getState().reportGlobalError(message);
  });
}
