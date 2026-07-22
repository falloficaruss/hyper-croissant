import { Chess } from "chess.js";
import { create } from "zustand";
import type {
  ConceptEvaluation,
  EngineLineInfo,
  EvalSwing,
  MoveComparison,
  PlanSkeleton,
  ScoreData,
  SwingSeverity,
} from "../types/analysis";
import type { AnalysisLine, Score } from "../types/engine";
import * as tauri from "../lib/tauri";

/** Minimum absolute swing (cp) before we request / show a card. */
export const SWING_DISPLAY_THRESHOLD_CP = 50;

/** Minimum absolute eval gap (cp) to show comparison when no feature signal. */
export const COMPARISON_DISPLAY_THRESHOLD_CP = 30;

/** Minimum engine depth before we request a plan for the position. */
export const PLAN_MIN_DEPTH = 8;

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

/** Plan data tied to a position + best move context. */
export interface PositionPlan {
  fen: string;
  bestMoveUci: string | null;
  bestMoveSan: string | null;
  concepts: ConceptEvaluation;
  plan: PlanSkeleton;
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

  /** Current plan for the active position. */
  currentPlan: PositionPlan | null;
  planLoading: boolean;
  planError: string | null;
  planExplanation: string | null;
  planExplaining: boolean;
  /** FEN currently being (or last successfully) planned — avoids duplicate fetches. */
  planFen: string | null;

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
  analyzePlan: (params: {
    fen: string;
    engineLines: AnalysisLine[];
  }) => Promise<void>;
  clearSwing: () => void;
  clearComparison: () => void;
  clearPlan: () => void;
  clearAnalysisCards: () => void;
  setSwingExplanation: (text: string | null) => void;
  setSwingExplaining: (v: boolean) => void;
  dismissSwing: () => void;
  setComparisonExplanation: (text: string | null) => void;
  setComparisonExplaining: (v: boolean) => void;
  dismissComparison: () => void;
  setPlanExplanation: (text: string | null) => void;
  setPlanExplaining: (v: boolean) => void;
  dismissPlan: () => void;
}

function scoreToData(score: Score): ScoreData {
  if (score.type === "Cp") {
    return { kind: "cp", value: score.value };
  }
  return { kind: "mate", value: score.value };
}

function analysisLinesToEngineInfo(lines: AnalysisLine[]): EngineLineInfo[] {
  return lines.map((l) => ({
    depth: l.depth,
    score: scoreToData(l.score),
    pv: l.pv,
    multipv: l.multipv,
  }));
}

function hasPlanContent(plan: PlanSkeleton): boolean {
  return (
    plan.immediate.length > 0 ||
    plan.medium.length > 0 ||
    plan.long_term.length > 0
  );
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
  currentPlan: null,
  planLoading: false,
  planError: null,
  planExplanation: null,
  planExplaining: false,
  planFen: null,

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

  analyzePlan: async ({ fen, engineLines }) => {
    if (engineLines.length === 0) return;

    const top = engineLines.find((l) => l.multipv === 1) ?? engineLines[0];
    if (!top || top.depth < PLAN_MIN_DEPTH) return;

    const { planFen, planLoading, currentPlan } = get();
    // Skip if we already have a plan for this FEN, or a fetch is in flight for it
    if (planFen === fen && (currentPlan !== null || planLoading)) return;

    set({
      planLoading: true,
      planError: null,
      planExplanation: null,
      planFen: fen,
    });

    try {
      const analysis = await tauri.analyzePosition(fen, analysisLinesToEngineInfo(engineLines));
      // Stale response if the user navigated away
      if (get().planFen !== fen) return;

      const plan = analysis.concepts.plan;
      if (!hasPlanContent(plan)) {
        set({ currentPlan: null, planLoading: false });
        return;
      }

      const bestUci = top.pv?.[0] ?? null;
      let bestMoveSan: string | null = null;
      if (bestUci && bestUci.length >= 4) {
        try {
          const chess = new Chess(fen);
          const from = bestUci.slice(0, 2);
          const to = bestUci.slice(2, 4);
          const promotion = bestUci.length > 4 ? bestUci[4] : undefined;
          const move = chess.move({ from, to, promotion });
          bestMoveSan = move?.san ?? null;
        } catch {
          bestMoveSan = null;
        }
      }

      set({
        currentPlan: {
          fen,
          bestMoveUci: bestUci,
          bestMoveSan,
          concepts: analysis.concepts,
          plan,
        },
        planLoading: false,
      });
    } catch (err) {
      if (get().planFen !== fen) return;
      const message = err instanceof Error ? err.message : "Failed to analyze plan";
      set({ planLoading: false, planError: message, currentPlan: null });
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

  clearPlan: () =>
    set({
      currentPlan: null,
      planError: null,
      planExplanation: null,
      planExplaining: false,
      planLoading: false,
      planFen: null,
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
      // Keep plan — it is position-scoped, not move-scoped
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

  setPlanExplanation: (text) => set({ planExplanation: text }),

  setPlanExplaining: (v) => set({ planExplaining: v }),

  dismissPlan: () =>
    set({
      currentPlan: null,
      planExplanation: null,
      planExplaining: false,
      planError: null,
      planLoading: false,
      planFen: null,
    }),
}));
