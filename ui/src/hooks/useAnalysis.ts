import { useEffect, useRef } from "react";
import { useEngineStore } from "../stores/engineStore";
import { useGameStore } from "../stores/gameStore";
import { useAnalysisStore } from "../stores/analysisStore";

interface PendingSwing {
  fenBefore: string;
  fenAfter: string;
  userMove: string;
}

/**
 * Tracks engine evaluations per FEN and triggers eval-swing analysis
 * when the user advances to a new position after a move.
 */
export function useAnalysis() {
  const analysisLines = useEngineStore((s) => s.analysisLines);
  const fen = useGameStore((s) => s.fen);
  const moves = useGameStore((s) => s.moves);
  const currentMoveIndex = useGameStore((s) => s.currentMoveIndex);

  const recordEval = useAnalysisStore((s) => s.recordEval);
  const analyzeSwing = useAnalysisStore((s) => s.analyzeSwing);
  const clearSwing = useAnalysisStore((s) => s.clearSwing);
  const getEval = useAnalysisStore((s) => s.getEval);
  const afterEval = useAnalysisStore((s) => s.evalByFen[fen]);

  const prevFenRef = useRef<string | null>(null);
  const prevMoveIndexRef = useRef(currentMoveIndex);
  const pendingRef = useRef<PendingSwing | null>(null);

  // Record top engine line eval for the current FEN
  useEffect(() => {
    const top = analysisLines.find((l) => l.multipv === 1) ?? analysisLines[0];
    if (!top?.score) return;
    recordEval(fen, top.score, top.depth);
  }, [analysisLines, fen, recordEval]);

  // When the position changes due to a move (index increased), try swing analysis
  useEffect(() => {
    const prevFen = prevFenRef.current;
    const prevIndex = prevMoveIndexRef.current;
    prevFenRef.current = fen;
    prevMoveIndexRef.current = currentMoveIndex;

    // Navigating backward → clear swing card
    if (currentMoveIndex < prevIndex) {
      pendingRef.current = null;
      clearSwing();
      return;
    }

    // No previous position or same FEN
    if (!prevFen || prevFen === fen) return;

    // Only analyze single-step advances (playing a move or stepping forward one ply)
    if (currentMoveIndex !== prevIndex + 1) {
      // Multi-step jump — clear and skip
      if (currentMoveIndex !== prevIndex) {
        pendingRef.current = null;
        clearSwing();
      }
      return;
    }

    if (currentMoveIndex < 0 || currentMoveIndex >= moves.length) {
      pendingRef.current = null;
      clearSwing();
      return;
    }

    const move = moves[currentMoveIndex];
    if (!move?.uci) {
      pendingRef.current = null;
      clearSwing();
      return;
    }

    const pending: PendingSwing = {
      fenBefore: prevFen,
      fenAfter: fen,
      userMove: move.uci,
    };
    pendingRef.current = pending;

    const run = () => {
      void analyzeSwing(pending);
    };

    if (getEval(fen)) {
      run();
    } else {
      // Analyze with before-score only; refresh when after-eval arrives
      run();
      const t = window.setTimeout(run, 1200);
      return () => window.clearTimeout(t);
    }
  }, [fen, currentMoveIndex, moves, analyzeSwing, clearSwing, getEval]);

  // When after-eval updates for the current position, re-analyze pending swing
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (pending.fenAfter !== fen) return;
    if (!afterEval) return;
    void analyzeSwing(pending);
  }, [afterEval, fen, analyzeSwing]);
}
