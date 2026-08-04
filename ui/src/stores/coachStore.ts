import { create } from "zustand";
import type { ConversationEntry } from "../types/llm";
import type { StructuredAnalysis } from "../types/analysis";

export type CoachPhase = "idle" | "ready" | "coaching" | "revealed";

export interface CoachSession {
  /** Board session this chat belongs to (from gameStore.boardSessionId). */
  boardSessionId: string;
  /** Latest FEN discussed; moves update this without clearing chat. */
  fen: string;
  entries: ConversationEntry[];
  revealed: boolean;
  analysis: StructuredAnalysis | null;
  startedAt: number;
}

interface CoachState {
  /** Whether coach mode UI is active (hides engine analysis until revealed). */
  enabled: boolean;
  phase: CoachPhase;
  /** Active coaching chat for the current board session. */
  session: CoachSession | null;
  /**
   * Archived chats keyed by boardSessionId.
   * Returning to a previous board session (rare) can restore that chat.
   */
  historyBySession: Record<string, CoachSession>;
  streaming: boolean;
  analyzing: boolean;
  error: string | null;

  setEnabled: (enabled: boolean) => void;
  setPhase: (phase: CoachPhase) => void;
  setStreaming: (v: boolean) => void;
  setAnalyzing: (v: boolean) => void;
  setError: (error: string | null) => void;

  /** Begin or resume a coach chat for the given board session. */
  startSession: (
    boardSessionId: string,
    fen: string,
    analysis: StructuredAnalysis | null,
  ) => void;
  appendEntry: (entry: ConversationEntry) => void;
  updateLastAssistant: (content: string) => void;
  setAnalysis: (analysis: StructuredAnalysis | null) => void;
  /** Keep the same chat when the user moves; refresh fen + analysis. */
  updatePosition: (fen: string, analysis?: StructuredAnalysis | null) => void;
  revealAnswer: () => void;
  endSession: () => void;
  /**
   * Called when the board is replaced (new game / load PGN/FEN/saved).
   * Archives the current chat and opens a fresh ready state.
   */
  onBoardSessionChange: (boardSessionId: string) => void;
  clearError: () => void;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export { generateId as generateCoachEntryId };

function archiveSession(
  session: CoachSession | null,
  history: Record<string, CoachSession>,
): Record<string, CoachSession> {
  if (!session) return history;
  return { ...history, [session.boardSessionId]: session };
}

export const useCoachStore = create<CoachState>((set, get) => ({
  enabled: false,
  phase: "idle",
  session: null,
  historyBySession: {},
  streaming: false,
  analyzing: false,
  error: null,

  setEnabled: (enabled) => {
    if (!enabled) {
      const { session, historyBySession } = get();
      set({
        enabled: false,
        phase: "idle",
        session: null,
        historyBySession: archiveSession(session, historyBySession),
        streaming: false,
        analyzing: false,
        error: null,
      });
      return;
    }
    // Entering coach mode keeps any active session if still valid.
    const { session } = get();
    set({
      enabled: true,
      phase: session ? (session.revealed ? "revealed" : "coaching") : "ready",
      error: null,
    });
  },

  setPhase: (phase) => set({ phase }),

  setStreaming: (v) => set({ streaming: v }),

  setAnalyzing: (v) => set({ analyzing: v }),

  setError: (error) => set({ error }),

  startSession: (boardSessionId, fen, analysis) => {
    const { historyBySession, session } = get();

    // Already chatting on this board session — just refresh fen/analysis.
    if (session && session.boardSessionId === boardSessionId) {
      set({
        session: {
          ...session,
          fen,
          analysis: analysis ?? session.analysis,
        },
        phase: session.revealed ? "revealed" : "coaching",
        error: null,
      });
      return;
    }

    const existing = historyBySession[boardSessionId];
    if (existing && existing.entries.length > 0) {
      set({
        session: {
          ...existing,
          fen,
          analysis: analysis ?? existing.analysis,
        },
        phase: existing.revealed ? "revealed" : "coaching",
        historyBySession: archiveSession(session, historyBySession),
        error: null,
      });
      return;
    }

    set({
      session: {
        boardSessionId,
        fen,
        entries: [],
        revealed: false,
        analysis,
        startedAt: Date.now(),
      },
      phase: "coaching",
      historyBySession: archiveSession(session, historyBySession),
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

  updatePosition: (fen, analysis) => {
    const { session } = get();
    if (!session) return;
    set({
      session: {
        ...session,
        fen,
        analysis: analysis !== undefined ? analysis : session.analysis,
      },
    });
  },

  revealAnswer: () => {
    const { session, historyBySession } = get();
    if (!session) return;
    const updated: CoachSession = { ...session, revealed: true };
    set({
      session: updated,
      phase: "revealed",
      historyBySession: {
        ...historyBySession,
        [updated.boardSessionId]: updated,
      },
    });
  },

  endSession: () => {
    const { session, historyBySession, enabled } = get();
    set({
      session: null,
      phase: enabled ? "ready" : "idle",
      historyBySession: archiveSession(session, historyBySession),
      streaming: false,
      analyzing: false,
      error: null,
    });
  },

  onBoardSessionChange: (boardSessionId) => {
    const { session, historyBySession, enabled } = get();
    if (!enabled) {
      // Still archive if we had a dangling session while disabled.
      if (session) {
        set({
          session: null,
          historyBySession: archiveSession(session, historyBySession),
        });
      }
      return;
    }

    // Same board session — nothing to do (moves do not change boardSessionId).
    if (session?.boardSessionId === boardSessionId) return;

    const nextHistory = archiveSession(session, historyBySession);
    const existing = nextHistory[boardSessionId];
    if (existing && existing.entries.length > 0) {
      set({
        session: existing,
        historyBySession: nextHistory,
        phase: existing.revealed ? "revealed" : "coaching",
        streaming: false,
        analyzing: false,
        error: null,
      });
      return;
    }

    // Fresh board → new coach session shell (user hits Start Session).
    set({
      session: null,
      historyBySession: nextHistory,
      phase: "ready",
      streaming: false,
      analyzing: false,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
