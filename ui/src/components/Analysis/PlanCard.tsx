import { useCallback, useState } from "react";
import { useAnalysisStore } from "../../stores/analysisStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { resolveProvider } from "../../lib/llm";
import type { PlanSkeleton } from "../../types/analysis";

function planHasContent(plan: PlanSkeleton): boolean {
  return (
    plan.immediate.length > 0 ||
    plan.medium.length > 0 ||
    plan.long_term.length > 0
  );
}

function PlanBranch({
  label,
  items,
  expanded,
  onToggle,
}: {
  label: string;
  items: string[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="plan-branch">
      <button
        type="button"
        className="plan-branch-header"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={`plan-branch-chevron ${expanded ? "expanded" : ""}`}>
          ▸
        </span>
        <span className="plan-branch-label">{label}</span>
      </button>
      {expanded && (
        <ul className="plan-branch-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PlanCard() {
  const planData = useAnalysisStore((s) => s.currentPlan);
  const loading = useAnalysisStore((s) => s.planLoading);
  const error = useAnalysisStore((s) => s.planError);
  const explanation = useAnalysisStore((s) => s.planExplanation);
  const explaining = useAnalysisStore((s) => s.planExplaining);
  const dismissPlan = useAnalysisStore((s) => s.dismissPlan);
  const setPlanExplanation = useAnalysisStore((s) => s.setPlanExplanation);
  const setPlanExplaining = useAnalysisStore((s) => s.setPlanExplaining);

  const explanationLevel = useSettingsStore((s) => s.explanationLevel);
  const getLLMConfig = useSettingsStore((s) => s.getLLMConfig);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  const [expanded, setExpanded] = useState({
    immediate: true,
    medium: true,
    longTerm: false,
  });

  const handleExplain = useCallback(async () => {
    if (!planData) return;
    const config = getLLMConfig();
    if (!config.useProxy && !config.apiKey && config.provider !== "ollama") {
      setSettingsOpen(true);
      return;
    }

    setPlanExplaining(true);
    setPlanExplanation("");

    const moveLabel = planData.bestMoveSan ?? planData.bestMoveUci ?? "the best move";

    const prompt = {
      type: "explain_plan",
      explanation_level: explanationLevel,
      user_question: `What's the plan after ${moveLabel}?`,
      best_move: planData.bestMoveUci,
      best_move_san: planData.bestMoveSan,
      plan: planData.plan,
      concepts: {
        initiative: planData.concepts.initiative,
        tempo_advantage: planData.concepts.tempo_advantage,
        key_ideas: planData.concepts.key_ideas,
        strategic_summary: planData.concepts.strategic_summary,
      },
    };

    const systemPrompt = `You are a chess coach explaining the strategic plan behind a position to a club-level player.

CRITICAL RULES:
- You may ONLY explain the supplied structured plan and concept data.
- Do NOT invent moves, variations, or calculations.
- Reference only the supplied plan steps (immediate, medium, long_term), key ideas, and strategic summary.
- If evidence is insufficient, say so.
- Use standard algebraic notation (SAN).
- Match the requested explanation level.
- Structure your answer around the plan timeline: immediate idea → short-term plan → long-term goal.`;

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
          setPlanExplanation(accumulated);
        },
      });
      setPlanExplanation(full || accumulated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to explain plan";
      setPlanExplanation(`Error: ${message}`);
    } finally {
      setPlanExplaining(false);
    }
  }, [
    planData,
    explanationLevel,
    getLLMConfig,
    setSettingsOpen,
    setPlanExplanation,
    setPlanExplaining,
  ]);

  if (loading && !planData) {
    return (
      <div className="plan-card plan-loading">
        Extracting strategic plan…
      </div>
    );
  }

  if (error && !planData) {
    return (
      <div className="plan-card plan-error">
        <span>{error}</span>
        <button type="button" className="plan-dismiss" onClick={dismissPlan}>
          ✕
        </button>
      </div>
    );
  }

  if (!planData || !planHasContent(planData.plan)) return null;

  const { plan, concepts, bestMoveSan, bestMoveUci } = planData;
  const moveLabel = bestMoveSan ?? bestMoveUci;

  return (
    <div className="plan-card">
      <div className="plan-header">
        <span className="plan-badge">Plan</span>
        {moveLabel && <span className="plan-move">{moveLabel}</span>}
        <button
          type="button"
          className="plan-dismiss"
          onClick={dismissPlan}
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {concepts.strategic_summary && (
        <div className="plan-summary">{concepts.strategic_summary}</div>
      )}

      {concepts.key_ideas.length > 0 && (
        <div className="plan-key-ideas">
          {concepts.key_ideas.map((idea) => (
            <span key={idea} className="plan-idea-chip">
              {idea}
            </span>
          ))}
        </div>
      )}

      <div className="plan-tree">
        <PlanBranch
          label="Immediate"
          items={plan.immediate}
          expanded={expanded.immediate}
          onToggle={() =>
            setExpanded((e) => ({ ...e, immediate: !e.immediate }))
          }
        />
        <PlanBranch
          label="3-move plan"
          items={plan.medium}
          expanded={expanded.medium}
          onToggle={() => setExpanded((e) => ({ ...e, medium: !e.medium }))}
        />
        <PlanBranch
          label="Long-term"
          items={plan.long_term}
          expanded={expanded.longTerm}
          onToggle={() =>
            setExpanded((e) => ({ ...e, longTerm: !e.longTerm }))
          }
        />
      </div>

      {explanation && (
        <div className="plan-explanation">{explanation}</div>
      )}

      <div className="plan-actions">
        <button
          type="button"
          className="plan-explain-btn"
          onClick={handleExplain}
          disabled={explaining}
        >
          {explaining ? "Explaining…" : explanation ? "Re-explain" : "Explain with AI"}
        </button>
      </div>
    </div>
  );
}
