import { useCallback } from "react";
import { useAnalysisStore } from "../../stores/analysisStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameStore } from "../../stores/gameStore";
import { getProviderOrThrow } from "../../lib/llm";
import type { MoveComparison } from "../../types/analysis";

function formatScoreData(score: { kind: string; value: number } | null): string {
  if (!score) return "—";
  if (score.kind === "cp") {
    const val = score.value / 100;
    return val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
  }
  return score.value > 0 ? `+#${score.value}` : `-#${Math.abs(score.value)}`;
}

function formatDiffPawns(pawns: number | null): string {
  if (pawns === null) return "Compared to engine move";
  if (pawns > 0.01) return `Difference: −${pawns.toFixed(1)} pawns`;
  if (pawns < -0.01) return `Difference: +${Math.abs(pawns).toFixed(1)} pawns (your move better)`;
  return "Difference: roughly equal";
}

function problemList(c: MoveComparison): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [
    ...c.concepts_lost,
    ...c.strategic_difference,
    ...c.tactical_impact,
  ]) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function playUci(
  uci: string,
  makeMove: (from: string, to: string, promotion?: string) => void,
) {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  makeMove(from, to, promotion);
}

export function ComparisonCard() {
  const comparison = useAnalysisStore((s) => s.currentComparison);
  const loading = useAnalysisStore((s) => s.comparisonLoading);
  const error = useAnalysisStore((s) => s.comparisonError);
  const explanation = useAnalysisStore((s) => s.comparisonExplanation);
  const explaining = useAnalysisStore((s) => s.comparisonExplaining);
  const dismissComparison = useAnalysisStore((s) => s.dismissComparison);
  const setComparisonExplanation = useAnalysisStore((s) => s.setComparisonExplanation);
  const setComparisonExplaining = useAnalysisStore((s) => s.setComparisonExplaining);

  const explanationLevel = useSettingsStore((s) => s.explanationLevel);
  const getLLMConfig = useSettingsStore((s) => s.getLLMConfig);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  const currentMoveIndex = useGameStore((s) => s.currentMoveIndex);
  const navigateToMove = useGameStore((s) => s.navigateToMove);
  const makeMove = useGameStore((s) => s.makeMove);

  const handlePlayMove = useCallback(
    (uci: string) => {
      if (!comparison) return;
      // Go back to the position before the compared move, then play the chosen line
      const beforeIndex = currentMoveIndex - 1;
      navigateToMove(beforeIndex);
      // Defer makeMove so navigation state settles
      window.setTimeout(() => {
        playUci(uci, makeMove);
      }, 0);
    },
    [comparison, currentMoveIndex, navigateToMove, makeMove],
  );

  const handleExplain = useCallback(async () => {
    if (!comparison) return;
    const config = getLLMConfig();
    if (!config.apiKey && config.provider !== "ollama") {
      setSettingsOpen(true);
      return;
    }

    setComparisonExplaining(true);
    setComparisonExplanation("");

    const prompt = {
      type: "compare_moves",
      explanation_level: explanationLevel,
      user_question: "Why was my move worse?",
      comparison: {
        user_move: comparison.user_move,
        engine_move: comparison.engine_move,
        user_move_san: comparison.user_move_san,
        engine_move_san: comparison.engine_move_san,
        user_move_eval: formatScoreData(comparison.user_move_eval),
        engine_move_eval: formatScoreData(comparison.engine_move_eval),
        eval_diff_cp: comparison.eval_diff_cp,
        eval_diff_pawns: comparison.eval_diff_pawns,
        concepts_lost: comparison.concepts_lost,
        concepts_gained: comparison.concepts_gained,
        tactical_impact: comparison.tactical_impact,
        strategic_difference: comparison.strategic_difference,
        why_engine: comparison.why_engine,
        summary: comparison.summary,
      },
    };

    const systemPrompt = `You are a chess coach explaining why one move is better than another to a club-level player.

CRITICAL RULES:
- You may ONLY explain the supplied structured comparison data.
- Do NOT invent moves, variations, or calculations.
- Reference only the supplied concepts, tactics, strategic differences, and why_engine points.
- If evidence is insufficient, say so.
- Use standard algebraic notation (SAN).
- Match the requested explanation level.`;

    try {
      const provider = getProviderOrThrow(config.provider);
      let accumulated = "";
      const full = await provider.chat({
        systemPrompt,
        messages: [{ role: "user", content: JSON.stringify(prompt) }],
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        onChunk: (text) => {
          accumulated += text;
          setComparisonExplanation(accumulated);
        },
      });
      setComparisonExplanation(full || accumulated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to explain comparison";
      setComparisonExplanation(`Error: ${message}`);
    } finally {
      setComparisonExplaining(false);
    }
  }, [
    comparison,
    explanationLevel,
    getLLMConfig,
    setSettingsOpen,
    setComparisonExplanation,
    setComparisonExplaining,
  ]);

  if (loading) {
    return (
      <div className="comparison-card comparison-loading">
        Comparing your move to the engine…
      </div>
    );
  }

  if (error && !comparison) {
    return (
      <div className="comparison-card comparison-error">
        <span>{error}</span>
        <button type="button" className="comparison-dismiss" onClick={dismissComparison}>
          ✕
        </button>
      </div>
    );
  }

  if (!comparison) return null;

  const problems = problemList(comparison);
  const userLabel = comparison.user_move_san ?? comparison.user_move;
  const engineLabel = comparison.engine_move_san ?? comparison.engine_move;

  return (
    <div className="comparison-card">
      <div className="comparison-header">
        <span className="comparison-badge">Why not</span>
        <button
          type="button"
          className="comparison-dismiss"
          onClick={dismissComparison}
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      <div className="comparison-moves">
        <button
          type="button"
          className="comparison-move-row comparison-move-user"
          onClick={() => handlePlayMove(comparison.user_move)}
          title="Play your move on the board"
        >
          <span className="comparison-move-label">Your move</span>
          <span className="comparison-move-san">{userLabel}</span>
          <span className="comparison-move-eval">
            {formatScoreData(comparison.user_move_eval)}
          </span>
        </button>
        <button
          type="button"
          className="comparison-move-row comparison-move-engine"
          onClick={() => handlePlayMove(comparison.engine_move)}
          title="Play engine move on the board"
        >
          <span className="comparison-move-label">Engine</span>
          <span className="comparison-move-san">{engineLabel}</span>
          <span className="comparison-move-eval">
            {formatScoreData(comparison.engine_move_eval)}
          </span>
        </button>
      </div>

      <div className="comparison-headline">{formatDiffPawns(comparison.eval_diff_pawns)}</div>

      {problems.length > 0 && (
        <div className="comparison-reasons">
          <div className="comparison-reasons-label">Your move:</div>
          <ul className="comparison-reasons-list">
            {problems.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {comparison.why_engine.length > 0 && (
        <div className="comparison-why-engine">
          <div className="comparison-reasons-label">Engine move:</div>
          <ul className="comparison-reasons-list">
            {comparison.why_engine.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {explanation && (
        <div className="comparison-explanation">{explanation}</div>
      )}

      <div className="comparison-actions">
        <button
          type="button"
          className="comparison-explain-btn"
          onClick={handleExplain}
          disabled={explaining}
        >
          {explaining ? "Explaining…" : explanation ? "Re-explain" : "Explain with AI"}
        </button>
      </div>
    </div>
  );
}
