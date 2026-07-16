import { create } from "zustand";
import type { EvalSwing, ScoreData, SwingSeverity } from "../types/analysis";
import type { Score } from "../types/engine";
import * as tauri from "../lib/tauri";

/** Minimum absolute swing (cp) before we request / show a card. */
export const SWING_DISPLAY_THRESHOLD_CP = 50;

interface PositionEval {
  fen: string;
  score: ScoreData;
  depth: number;
}

interface AnalysisState {
  /** Latest engine score per FEN (normalized as stored). */
  evalByFen: Record<string, PositionEval>;
  /** Current swing for the last move that crossed the threshold. */
  currentSwing: EvalSwing | null;
  /** Loading state for swing analysis. */
  swingLoading: boolean;
  swingError: string | null;
  /** Optional LLM explanation of the current swing. */
  swingExplanation: string | null;
  swingExplaining: boolean;

  recordEval: (fen: string, score: Score, depth: number) => void;
  getEval: (fen: string) => PositionEval | undefined;
  analyzeSwing: (params: {
    fenBefore: string;
    fenAfter: string;
    userMove: string;
  }) => Promise<void>;
  clearSwing: () => void;
  setSwingExplanation: (text: string | null) => void;
  setSwingExplaining: (v: boolean) => void;
  dismissSwing: () => void;
}

function scoreToData(score: Score): ScoreData {
  if (score.type === "Cp") {
    return { kind: "cp", value: score.value };
  }
  return { kind: "mate", value: score.value };
}

function isSignificantSwing(swing: EvalSwing): boolean {
  if (swing.severity === "none") return false;
  if (swing.swing_cp !== null && Math.abs(swing.swing_cp) >= SWING_DISPLAY_THRESHOLD_CP) {
    return true;
  }
  // Feature-only signal with non-none severity
  return swing.consequences.length > 0 || swing.tactical_motifs.length > 0;
}

export function severityLabel(severity: SwingSeverity): string {
  switch (severity) {
    case "blunder":
      return "Blunder";
    case "significant":
      return "Significant";
    case "minor":
      return "Minor";
    default:
      return "None";
  }
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  evalByFen: {},
  currentSwing: null,
  swingLoading: false,
  swingError: null,
  swingExplanation: null,
  swingExplaining: false,

  recordEval: (fen, score, depth) => {
    const existing = get().evalByFen[fen];
    // Keep the deepest evaluation for each position
    if (existing && existing.depth > depth) return;
    set((s) => ({
      evalByFen: {
        ...s.evalByFen,
        [fen]: { fen, score: scoreToData(score), depth },
      },
    }));
  },

  getEval: (fen) => get().evalByFen[fen],

  analyzeSwing: async ({ fenBefore, fenAfter, userMove }) => {
    const { evalByFen } = get();
    const before = evalByFen[fenBefore];
    const after = evalByFen[fenAfter];

    // Need at least one score to be meaningful; prefer both
    if (!before && !after) {
      set({ currentSwing: null, swingError: null });
      return;
    }

    set({ swingLoading: true, swingError: null, swingExplanation: null });
    try {
      const swing = await tauri.analyzeEvalSwing(
        fenBefore,
        userMove,
        before?.score,
        after?.score,
      );

      if (isSignificantSwing(swing)) {
        set({ currentSwing: swing, swingLoading: false });
      } else {
        set({ currentSwing: null, swingLoading: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to analyze eval swing";
      set({ swingLoading: false, swingError: message, currentSwing: null });
    }
  },

  clearSwing: () =>
    set({
      currentSwing: null,
      swingError: null,
      swingExplanation: null,
      swingExplaining: false,
    }),

  setSwingExplanation: (text) => set({ swingExplanation: text }),

  setSwingExplaining: (v) => set({ swingExplaining: v }),

  dismissSwing: () =>
    set({
      currentSwing: null,
      swingExplanation: null,
      swingExplaining: false,
      swingError: null,
    }),
}));
