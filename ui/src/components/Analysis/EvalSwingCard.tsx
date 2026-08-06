import { useCallback } from "react";
import { severityLabel, useAnalysisStore } from "../../stores/analysisStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { resolveProvider } from "../../lib/llm";
import { MarkdownContent } from "../LLM/MarkdownContent";
import type { EvalSwing } from "../../types/analysis";
import type { SwingSeverity } from "../../types/analysis";
import "../LLM/LLM.css";

function formatScoreData(score: { kind: string; value: number } | null): string {
  if (!score) return "—";
  if (score.kind === "cp") {
    const val = score.value / 100;
    return val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
  }
  return score.value > 0 ? `+#${score.value}` : `-#${Math.abs(score.value)}`;
}

function formatSwingPawns(pawns: number | null): string {
  if (pawns === null) return "Eval changed";
  if (pawns < -0.01) return `You lost ${Math.abs(pawns).toFixed(1)} pawns`;
  if (pawns > 0.01) return `You gained ${pawns.toFixed(1)} pawns`;
  return "Evaluation roughly unchanged";
}

function severityClass(severity: SwingSeverity): string {
  switch (severity) {
    case "blunder":
      return "eval-swing-blunder";
    case "significant":
      return "eval-swing-significant";
    case "minor":
      return "eval-swing-minor";
    default:
      return "";
  }
}

function reasons(swing: EvalSwing): string[] {
  return [...swing.consequences, ...swing.tactical_motifs];
}

export function EvalSwingCard() {
  const swing = useAnalysisStore((s) => s.currentSwing);
  const loading = useAnalysisStore((s) => s.swingLoading);
  const error = useAnalysisStore((s) => s.swingError);
  const explanation = useAnalysisStore((s) => s.swingExplanation);
  const explaining = useAnalysisStore((s) => s.swingExplaining);
  const dismissSwing = useAnalysisStore((s) => s.dismissSwing);
  const setSwingExplanation = useAnalysisStore((s) => s.setSwingExplanation);
  const setSwingExplaining = useAnalysisStore((s) => s.setSwingExplaining);

  const explanationLevel = useSettingsStore((s) => s.explanationLevel);
  const getLLMConfig = useSettingsStore((s) => s.getLLMConfig);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  const handleExplain = useCallback(async () => {
    if (!swing) return;
    const config = getLLMConfig();
    if (!config.useProxy && !config.apiKey && config.provider !== "ollama") {
      setSettingsOpen(true);
      return;
    }

    setSwingExplaining(true);
    setSwingExplanation("");

    const prompt = {
      type: "explain_swing",
      explanation_level: explanationLevel,
      user_question: "Why did the evaluation change after this move?",
      eval_swing: {
        user_move: swing.user_move_san ?? swing.user_move,
        user_move_uci: swing.user_move,
        eval_before: formatScoreData(swing.eval_before),
        eval_after: formatScoreData(swing.eval_after),
        swing_pawns: swing.swing_pawns,
        swing_cp: swing.swing_cp,
        severity: swing.severity,
        consequences: swing.consequences,
        tactical_motifs: swing.tactical_motifs,
        summary: swing.summary,
      },
    };

    const systemPrompt = `You are a chess coach explaining evaluation swings to a club-level player.

CRITICAL RULES:
- You may ONLY explain the supplied structured eval swing data.
- Do NOT invent moves, variations, or calculations.
- Reference only the supplied consequences and tactical motifs.
- If evidence is insufficient, say so.
- Always write moves in standard algebraic notation (SAN), e.g. Nf3, O-O, Bxe5+, not UCI like g1f3.
- Prefer user_move (SAN). Ignore user_move_uci unless the user asks for engine coordinates.
- Match the requested explanation level.`;

    try {
      const provider = resolveProvider(config);
      let accumulated = "";
      const full = await provider.chat({
        systemPrompt,
        messages: [{ role: "user", content: JSON.stringify(prompt) }],
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        onChunk: (text) => {
          accumulated += text;
          setSwingExplanation(accumulated);
        },
      });
      setSwingExplanation(full || accumulated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to explain swing";
      setSwingExplanation(`Error: ${message}`);
    } finally {
      setSwingExplaining(false);
    }
  }, [
    swing,
    explanationLevel,
    getLLMConfig,
    setSettingsOpen,
    setSwingExplanation,
    setSwingExplaining,
  ]);

  if (loading) {
    return (
      <div className="eval-swing-card eval-swing-loading">
        Analyzing evaluation change…
      </div>
    );
  }

  if (error && !swing) {
    return (
      <div className="eval-swing-card eval-swing-error">
        <span>{error}</span>
        <button type="button" className="eval-swing-dismiss" onClick={dismissSwing}>
          ✕
        </button>
      </div>
    );
  }

  if (!swing) return null;

  const reasonList = reasons(swing);
  const moveLabel = swing.user_move_san ?? swing.user_move;

  return (
    <div className={`eval-swing-card ${severityClass(swing.severity)}`}>
      <div className="eval-swing-header">
        <span className="eval-swing-badge">{severityLabel(swing.severity)}</span>
        <span className="eval-swing-move">{moveLabel}</span>
        <button
          type="button"
          className="eval-swing-dismiss"
          onClick={dismissSwing}
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      <div className="eval-swing-headline">{formatSwingPawns(swing.swing_pawns)}</div>

      <div className="eval-swing-scores">
        <span className="eval-swing-score-before">
          {formatScoreData(swing.eval_before)}
        </span>
        <span className="eval-swing-arrow">→</span>
        <span className="eval-swing-score-after">
          {formatScoreData(swing.eval_after)}
        </span>
      </div>

      {reasonList.length > 0 && (
        <div className="eval-swing-reasons">
          <div className="eval-swing-reasons-label">Reason:</div>
          <ul className="eval-swing-reasons-list">
            {reasonList.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {explanation && (
        <MarkdownContent content={explanation} className="eval-swing-explanation" />
      )}

      <div className="eval-swing-actions">
        <button
          type="button"
          className="eval-swing-explain-btn"
          onClick={handleExplain}
          disabled={explaining}
        >
          {explaining ? "Explaining…" : explanation ? "Re-explain" : "Explain with AI"}
        </button>
      </div>
    </div>
  );
}
