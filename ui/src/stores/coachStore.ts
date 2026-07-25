import { create } from "zustand";
import type { ConversationEntry } from "../types/llm";
import type { StructuredAnalysis } from "../types/analysis";

export type CoachPhase = "idle" | "ready" | "coaching" | "revealed";

interface CoachSession {
  fen: string;
  entries: ConversationEntry[];
  revealed: boolean;
  analysis: StructuredAnalysis | null;
  startedAt: number;
}

interface CoachState {
  /** Whether coach mode UI is active (hides engine analysis). */
  enabled: boolean;
  phase: CoachPhase;
  /** Active session for the current position. */
  session: CoachSession | null;
  /** Past sessions keyed by FEN (in-memory history). */
  historyByFen: Record<string, CoachSession>;
  streaming: boolean;
  analyzing: boolean;
  error: string | null;

  setEnabled: (enabled: boolean) => void;
  setPhase: (phase: CoachPhase) => void;
  setStreaming: (v: boolean) => void;
  setAnalyzing: (v: boolean) => void;
  setError: (error: string | null) => void;

  /** Begin or resume a session for the given FEN. */
  startSession: (fen: string, analysis: StructuredAnalysis | null) => void;
  appendEntry: (entry: ConversationEntry) => void;
  updateLastAssistant: (content: string) => void;
  setAnalysis: (analysis: StructuredAnalysis | null) => void;
  revealAnswer: () => void;
  endSession: () => void;
  /** Soft-reset when the board position changes mid-session. */
  onPositionChange: (fen: string) => void;
  clearError: () => void;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export { generateId as generateCoachEntryId };

export const useCoachStore = create<CoachState>((set, get) => ({
  enabled: false,
  phase: "idle",
  session: null,
  historyByFen: {},
  streaming: false,
  analyzing: false,
  error: null,

  setEnabled: (enabled) => {
    if (!enabled) {
      const { session, historyByFen } = get();
      const nextHistory = { ...historyByFen };
      if (session) {
        nextHistory[session.fen] = session;
      }
      set({
        enabled: false,
        phase: "idle",
        session: null,
        historyByFen: nextHistory,
        streaming: false,
        analyzing: false,
        error: null,
      });
      return;
    }
    set({ enabled: true, phase: "ready", error: null });
  },

  setPhase: (phase) => set({ phase }),

  setStreaming: (v) => set({ streaming: v }),

  setAnalyzing: (v) => set({ analyzing: v }),

  setError: (error) => set({ error }),

  startSession: (fen, analysis) => {
    const { historyByFen } = get();
    const existing = historyByFen[fen];
    if (existing && existing.entries.length > 0) {
      set({
        session: {
          ...existing,
          analysis: analysis ?? existing.analysis,
        },
        phase: existing.revealed ? "revealed" : "coaching",
        error: null,
      });
      return;
    }

    set({
      session: {
        fen,
        entries: [],
        revealed: false,
        analysis,
        startedAt: Date.now(),
      },
      phase: "coaching",
      error: null,
    });
  },

  appendEntry: (entry) => {
    const { session } = get();
    if (!session) return;
    set({
      session: {
        ...session,
        entries: [...session.entries, entry],
      },
    });
  },

  updateLastAssistant: (content) => {
    const { session } = get();
    if (!session || session.entries.length === 0) return;
    const entries = [...session.entries];
    const last = entries[entries.length - 1];
    if (!last || last.role !== "assistant") return;
    entries[entries.length - 1] = { ...last, content };
    set({ session: { ...session, entries } });
  },

  setAnalysis: (analysis) => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, analysis } });
  },

  revealAnswer: () => {
    const { session, historyByFen } = get();
    if (!session) return;
    const updated: CoachSession = { ...session, revealed: true };
    set({
      session: updated,
      phase: "revealed",
      historyByFen: { ...historyByFen, [updated.fen]: updated },
    });
  },

  endSession: () => {
    const { session, historyByFen } = get();
    const nextHistory = { ...historyByFen };
    if (session) {
      nextHistory[session.fen] = session;
    }
    set({
      session: null,
      phase: get().enabled ? "ready" : "idle",
      historyByFen: nextHistory,
      streaming: false,
      analyzing: false,
      error: null,
    });
  },

  onPositionChange: (fen) => {
    const { session, historyByFen, enabled } = get();
    if (!enabled) return;

    // Persist current session
    const nextHistory = { ...historyByFen };
    if (session) {
      nextHistory[session.fen] = session;
    }

    const existing = nextHistory[fen];
    if (existing && existing.entries.length > 0) {
      set({
        session: existing,
        historyByFen: nextHistory,
        phase: existing.revealed ? "revealed" : "coaching",
        streaming: false,
        analyzing: false,
        error: null,
      });
      return;
    }

    set({
      session: null,
      historyByFen: nextHistory,
      phase: "ready",
      streaming: false,
      analyzing: false,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
