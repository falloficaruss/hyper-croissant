import { useEffect, useRef } from "react";
import { useEngineStore } from "../stores/engineStore";
import { useGameStore } from "../stores/gameStore";
import { useAnalysisStore } from "../stores/analysisStore";

interface PendingAnalysis {
  fenBefore: string;
  fenAfter: string;
  userMove: string;
  engineMove: string | null;
}

/**
 * Tracks engine evaluations per FEN and triggers eval-swing + why-not
 * comparison analysis when the user advances to a new position after a move.
 * Also fetches the strategic plan for the current position.
 */
export function useAnalysis() {
  const analysisLines = useEngineStore((s) => s.analysisLines);
  const fen = useGameStore((s) => s.fen);
  const moves = useGameStore((s) => s.moves);
  const currentMoveIndex = useGameStore((s) => s.currentMoveIndex);

  const recordEval = useAnalysisStore((s) => s.recordEval);
  const recordBestMove = useAnalysisStore((s) => s.recordBestMove);
  const analyzeSwing = useAnalysisStore((s) => s.analyzeSwing);
  const analyzeComparison = useAnalysisStore((s) => s.analyzeComparison);
  const analyzePlan = useAnalysisStore((s) => s.analyzePlan);
  const clearAnalysisCards = useAnalysisStore((s) => s.clearAnalysisCards);
  const clearPlan = useAnalysisStore((s) => s.clearPlan);
  const getEval = useAnalysisStore((s) => s.getEval);
  const getBestMove = useAnalysisStore((s) => s.getBestMove);
  const afterEval = useAnalysisStore((s) => s.evalByFen[fen]);

  const prevFenRef = useRef<string | null>(null);
  const prevMoveIndexRef = useRef(currentMoveIndex);
  const pendingRef = useRef<PendingAnalysis | null>(null);

  // Record top engine line eval + best move for the current FEN
  useEffect(() => {
    const top = analysisLines.find((l) => l.multipv === 1) ?? analysisLines[0];
    if (!top?.score) return;
    recordEval(fen, top.score, top.depth);
    const bestUci = top.pv?.[0];
    if (bestUci) {
      recordBestMove(fen, bestUci, top.score, top.depth);
    }
  }, [analysisLines, fen, recordEval, recordBestMove]);

  // Clear plan when position changes (new fetch will repopulate once engine reports)
  useEffect(() => {
    clearPlan();
  }, [fen, clearPlan]);

  // Fetch plan once engine has produced lines for the current position
  useEffect(() => {
    if (analysisLines.length === 0) return;
    // Only trust lines after we've recorded an eval for this FEN
    if (!getEval(fen)) return;
    void analyzePlan({ fen, engineLines: analysisLines });
  }, [fen, analysisLines, analyzePlan, getEval]);

  // When the position changes due to a move (index increased), run analyses
  useEffect(() => {
    const prevFen = prevFenRef.current;
    const prevIndex = prevMoveIndexRef.current;
    prevFenRef.current = fen;
    prevMoveIndexRef.current = currentMoveIndex;

    // Navigating backward → clear cards
    if (currentMoveIndex < prevIndex) {
      pendingRef.current = null;
      clearAnalysisCards();
      return;
    }

    // No previous position or same FEN
    if (!prevFen || prevFen === fen) return;

    // Only analyze single-step advances
    if (currentMoveIndex !== prevIndex + 1) {
      if (currentMoveIndex !== prevIndex) {
        pendingRef.current = null;
        clearAnalysisCards();
      }
      return;
    }

    if (currentMoveIndex < 0 || currentMoveIndex >= moves.length) {
      pendingRef.current = null;
      clearAnalysisCards();
      return;
    }

    const move = moves[currentMoveIndex];
    if (!move?.uci) {
      pendingRef.current = null;
      clearAnalysisCards();
      return;
    }

    const best = getBestMove(prevFen);
    const pending: PendingAnalysis = {
      fenBefore: prevFen,
      fenAfter: fen,
      userMove: move.uci,
      engineMove: best?.uci ?? null,
    };
    pendingRef.current = pending;

    const run = () => {
      void analyzeSwing({
        fenBefore: pending.fenBefore,
        fenAfter: pending.fenAfter,
        userMove: pending.userMove,
      });
      // Prefer live best-move lookup in case it arrived after navigation
      const engineMove = getBestMove(pending.fenBefore)?.uci ?? pending.engineMove;
      if (engineMove && engineMove !== pending.userMove) {
        void analyzeComparison({
          fenBefore: pending.fenBefore,
          fenAfter: pending.fenAfter,
          userMove: pending.userMove,
          engineMove,
        });
      } else {
        // Clear stale comparison if user played the engine move
        useAnalysisStore.getState().clearComparison();
      }
    };

    run();
    if (!getEval(fen) || !getBestMove(prevFen)) {
      const t = window.setTimeout(run, 1200);
      return () => window.clearTimeout(t);
    }
  }, [
    fen,
    currentMoveIndex,
    moves,
    analyzeSwing,
    analyzeComparison,
    clearAnalysisCards,
    getEval,
    getBestMove,
  ]);

  // When after-eval updates for the current position, re-analyze pending
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (pending.fenAfter !== fen) return;
    if (!afterEval) return;

    void analyzeSwing({
      fenBefore: pending.fenBefore,
      fenAfter: pending.fenAfter,
      userMove: pending.userMove,
    });

    const engineMove = getBestMove(pending.fenBefore)?.uci ?? pending.engineMove;
    if (engineMove && engineMove !== pending.userMove) {
      void analyzeComparison({
        fenBefore: pending.fenBefore,
        fenAfter: pending.fenAfter,
        userMove: pending.userMove,
        engineMove,
      });
    }
  }, [afterEval, fen, analyzeSwing, analyzeComparison, getBestMove]);
}
