import { create } from "zustand";

/** @internal Tauri v2 runtime marker; present only inside the desktop shell. */
function detectTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const internals = (window as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
  return internals != null;
}

interface AppState {
  /** Whether the Tauri backend (IPC commands, engine, storage) is available. */
  backendAvailable: boolean;
  /** Latest uncaught async error surfaced by the global banner, if any. */
  globalError: string | null;
  checkBackend: () => void;
  reportGlobalError: (message: string) => void;
  clearGlobalError: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  backendAvailable: detectTauriRuntime(),
  globalError: null,

  checkBackend: () => set({ backendAvailable: detectTauriRuntime() }),

  reportGlobalError: (message) => set({ globalError: message }),

  clearGlobalError: () => set({ globalError: null }),
}));
