import { create } from "zustand";
import type { EvalSwing, MoveComparison, ScoreData, SwingSeverity } from "../types/analysis";
import type { Score } from "../types/engine";
import * as tauri from "../lib/tauri";

/** Minimum absolute swing (cp) before we request / show a card. */
export const SWING_DISPLAY_THRESHOLD_CP = 50;

/** Minimum absolute eval gap (cp) to show comparison when no feature signal. */
export const COMPARISON_DISPLAY_THRESHOLD_CP = 30;

interface PositionEval {
  fen: string;
  score: ScoreData;
  depth: number;
}

interface BestMoveInfo {
  uci: string;
  score: ScoreData;
  depth: number;
}

interface AnalysisState {
  /** Latest engine score per FEN (normalized as stored). */
  evalByFen: Record<string, PositionEval>;
  /** Best multipv-1 move per FEN (for why-not comparison). */
  bestMoveByFen: Record<string, BestMoveInfo>;

  /** Current swing for the last move that crossed the threshold. */
  currentSwing: EvalSwing | null;
  swingLoading: boolean;
  swingError: string | null;
  swingExplanation: string | null;
  swingExplaining: boolean;

  /** Current move comparison (user vs engine). */
  currentComparison: MoveComparison | null;
  comparisonLoading: boolean;
  comparisonError: string | null;
  comparisonExplanation: string | null;
  comparisonExplaining: boolean;

  recordEval: (fen: string, score: Score, depth: number) => void;
  recordBestMove: (fen: string, uci: string, score: Score, depth: number) => void;
  getEval: (fen: string) => PositionEval | undefined;
  getBestMove: (fen: string) => BestMoveInfo | undefined;
  analyzeSwing: (params: {
    fenBefore: string;
    fenAfter: string;
    userMove: string;
  }) => Promise<void>;
  analyzeComparison: (params: {
    fenBefore: string;
    fenAfter: string;
    userMove: string;
    engineMove: string;
  }) => Promise<void>;
  clearSwing: () => void;
  clearComparison: () => void;
  clearAnalysisCards: () => void;
  setSwingExplanation: (text: string | null) => void;
  setSwingExplaining: (v: boolean) => void;
  dismissSwing: () => void;
  setComparisonExplanation: (text: string | null) => void;
  setComparisonExplaining: (v: boolean) => void;
  dismissComparison: () => void;
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
  return swing.consequences.length > 0 || swing.tactical_motifs.length > 0;
}

function isSignificantComparison(c: MoveComparison): boolean {
  if (c.user_move === c.engine_move) return false;
  const hasContent =
    c.concepts_lost.length > 0 ||
    c.tactical_impact.length > 0 ||
    c.strategic_difference.length > 0 ||
    c.concepts_gained.length > 0;
  if (hasContent) return true;
  if (c.eval_diff_cp !== null && Math.abs(c.eval_diff_cp) >= COMPARISON_DISPLAY_THRESHOLD_CP) {
    return true;
  }
  return false;
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
  bestMoveByFen: {},
  currentSwing: null,
  swingLoading: false,
  swingError: null,
  swingExplanation: null,
  swingExplaining: false,
  currentComparison: null,
  comparisonLoading: false,
  comparisonError: null,
  comparisonExplanation: null,
  comparisonExplaining: false,

  recordEval: (fen, score, depth) => {
    const existing = get().evalByFen[fen];
    if (existing && existing.depth > depth) return;
    set((s) => ({
      evalByFen: {
        ...s.evalByFen,
        [fen]: { fen, score: scoreToData(score), depth },
      },
    }));
  },

  recordBestMove: (fen, uci, score, depth) => {
    if (!uci) return;
    const existing = get().bestMoveByFen[fen];
    if (existing && existing.depth > depth) return;
    set((s) => ({
      bestMoveByFen: {
        ...s.bestMoveByFen,
        [fen]: { uci, score: scoreToData(score), depth },
      },
    }));
  },

  getEval: (fen) => get().evalByFen[fen],

  getBestMove: (fen) => get().bestMoveByFen[fen],

  analyzeSwing: async ({ fenBefore, fenAfter, userMove }) => {
    const { evalByFen } = get();
    const before = evalByFen[fenBefore];
    const after = evalByFen[fenAfter];

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

  analyzeComparison: async ({ fenBefore, fenAfter, userMove, engineMove }) => {
    if (!engineMove || userMove === engineMove) {
      set({ currentComparison: null, comparisonError: null, comparisonLoading: false });
      return;
    }

    const { evalByFen, bestMoveByFen } = get();
    const after = evalByFen[fenAfter];
    const best = bestMoveByFen[fenBefore];
    // Engine score = multipv1 at fenBefore; user score ≈ eval after user's move
    const engineScore = best?.score ?? evalByFen[fenBefore]?.score;
    const userScore = after?.score;

    set({ comparisonLoading: true, comparisonError: null, comparisonExplanation: null });
    try {
      const comparison = await tauri.compareMoves(
        fenBefore,
        userMove,
        engineMove,
        userScore,
        engineScore,
      );

      if (isSignificantComparison(comparison)) {
        set({ currentComparison: comparison, comparisonLoading: false });
      } else {
        set({ currentComparison: null, comparisonLoading: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to compare moves";
      set({ comparisonLoading: false, comparisonError: message, currentComparison: null });
    }
  },

  clearSwing: () =>
    set({
      currentSwing: null,
      swingError: null,
      swingExplanation: null,
      swingExplaining: false,
    }),

  clearComparison: () =>
    set({
      currentComparison: null,
      comparisonError: null,
      comparisonExplanation: null,
      comparisonExplaining: false,
    }),

  clearAnalysisCards: () =>
    set({
      currentSwing: null,
      swingError: null,
      swingExplanation: null,
      swingExplaining: false,
      currentComparison: null,
      comparisonError: null,
      comparisonExplanation: null,
      comparisonExplaining: false,
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

  setComparisonExplanation: (text) => set({ comparisonExplanation: text }),

  setComparisonExplaining: (v) => set({ comparisonExplaining: v }),

  dismissComparison: () =>
    set({
      currentComparison: null,
      comparisonExplanation: null,
      comparisonExplaining: false,
      comparisonError: null,
    }),
}));
