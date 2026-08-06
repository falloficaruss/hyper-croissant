import { useCallback, useState } from "react";
import { useAnalysisStore } from "../../stores/analysisStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameStore } from "../../stores/gameStore";
import { resolveProvider } from "../../lib/llm";
import { MarkdownContent } from "../LLM/MarkdownContent";
import type { SearchTreeCategory, SearchTreeCluster } from "../../types/analysis";
import "../LLM/LLM.css";

function formatScoreData(score: { kind: string; value: number } | null | undefined): string {
  if (!score) return "—";
  if (score.kind === "cp") {
    const val = score.value / 100;
    return val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
  }
  return score.value > 0 ? `+#${score.value}` : `-#${Math.abs(score.value)}`;
}

function formatGap(cp: number | null): string | null {
  if (cp === null || cp <= 0) return null;
  const pawns = cp / 100;
  return pawns >= 1 ? `−${pawns.toFixed(1)}` : `−${pawns.toFixed(2)}`;
}

function categoryClass(cat: SearchTreeCategory): string {
  switch (cat) {
    case "main":
      return "search-tree-main";
    case "alternative":
      return "search-tree-alternative";
    case "inferior":
      return "search-tree-inferior";
    case "losing":
      return "search-tree-losing";
    default:
      return "";
  }
}

function categoryBadge(cat: SearchTreeCategory): string {
  switch (cat) {
    case "main":
      return "Main";
    case "alternative":
      return "Alt";
    case "inferior":
      return "Inferior";
    case "losing":
      return "Losing";
    default:
      return cat;
  }
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

function ClusterRow({
  cluster,
  expanded,
  onToggle,
  explanation,
  explaining,
  onExplain,
  onPlayMove,
}: {
  cluster: SearchTreeCluster;
  expanded: boolean;
  onToggle: () => void;
  explanation: string | undefined;
  explaining: boolean;
  onExplain: () => void;
  onPlayMove: (uci: string) => void;
}) {
  const barPct = Math.round(Math.max(0.05, Math.min(1, cluster.bar_ratio)) * 100);
  const gapLabel = formatGap(cluster.eval_gap_cp);
  const moveLabel = cluster.first_move_san ?? cluster.first_move;
  const topLine = cluster.lines[0];
  const pvSan = topLine?.pv_san ?? [];
  const isMain = cluster.category === "main";

  return (
    <div className={`search-tree-cluster ${categoryClass(cluster.category)}`}>
      <button
        type="button"
        className="search-tree-cluster-header"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={`search-tree-chevron${expanded ? " expanded" : ""}`}>▸</span>
        <span className="search-tree-badge">{categoryBadge(cluster.category)}</span>
        <span className="search-tree-move">{moveLabel}</span>
        <span className="search-tree-score">{formatScoreData(cluster.best_score)}</span>
        {gapLabel && <span className="search-tree-gap">{gapLabel}</span>}
      </button>

      <div className="search-tree-bar-track" title={`${barPct}% of main idea`}>
        <div
          className={`search-tree-bar-fill ${categoryClass(cluster.category)}`}
          style={{ width: `${barPct}%` }}
        />
      </div>

      {expanded && (
        <div className="search-tree-cluster-body">
          <div className="search-tree-summary">{cluster.summary}</div>

          {pvSan.length > 0 && (
            <div className="search-tree-pv">
              {pvSan.slice(0, 8).map((san, i) => {
                const uci = topLine?.pv[i];
                return (
                  <span
                    key={`${i}-${san}`}
                    className="search-tree-pv-move"
                    onClick={() => uci && onPlayMove(uci)}
                    title={uci ? `Play ${san}` : san}
                  >
                    {san}
                  </span>
                );
              })}
              {pvSan.length > 8 && <span className="search-tree-pv-more">…</span>}
            </div>
          )}

          {cluster.ideas.length > 0 && (
            <div className="search-tree-ideas">
              {cluster.ideas.slice(0, 4).map((idea) => (
                <span key={idea} className="search-tree-idea-chip">
                  {idea}
                </span>
              ))}
            </div>
          )}

          {!isMain && cluster.why_rejected.length > 0 && (
            <div className="search-tree-rejected">
              <div className="search-tree-rejected-label">Why the engine rejects this:</div>
              <ul className="search-tree-rejected-list">
                {cluster.why_rejected.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {explanation && (
            <MarkdownContent content={explanation} className="search-tree-explanation" />
          )}

          <div className="search-tree-actions">
            <button
              type="button"
              className="search-tree-explain-btn"
              onClick={onExplain}
              disabled={explaining}
            >
              {explaining
                ? "Explaining…"
                : explanation
                  ? "Re-explain"
                  : isMain
                    ? "Explain main idea"
                    : "Explain rejection"}
            </button>
            {cluster.first_move && (
              <button
                type="button"
                className="search-tree-play-btn"
                onClick={() => onPlayMove(cluster.first_move)}
              >
                Play {moveLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchTreeView() {
  const tree = useAnalysisStore((s) => s.currentSearchTree);
  const loading = useAnalysisStore((s) => s.searchTreeLoading);
  const error = useAnalysisStore((s) => s.searchTreeError);
  const explanations = useAnalysisStore((s) => s.searchTreeExplanations);
  const explainingId = useAnalysisStore((s) => s.searchTreeExplainingId);
  const dismissSearchTree = useAnalysisStore((s) => s.dismissSearchTree);
  const setSearchTreeExplanation = useAnalysisStore((s) => s.setSearchTreeExplanation);
  const setSearchTreeExplainingId = useAnalysisStore((s) => s.setSearchTreeExplainingId);

  const explanationLevel = useSettingsStore((s) => s.explanationLevel);
  const getLLMConfig = useSettingsStore((s) => s.getLLMConfig);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  const makeMove = useGameStore((s) => s.makeMove);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handlePlayMove = useCallback(
    (uci: string) => {
      playUci(uci, makeMove);
    },
    [makeMove],
  );

  const handleExplain = useCallback(
    async (cluster: SearchTreeCluster) => {
      if (!tree) return;
      const config = getLLMConfig();
      if (!config.useProxy && !config.apiKey && config.provider !== "ollama") {
        setSettingsOpen(true);
        return;
      }

      setSearchTreeExplainingId(cluster.id);
      setSearchTreeExplanation(cluster.id, "");

      const main = tree.clusters.find((c) => c.category === "main");
      const isMain = cluster.category === "main";
      const moveLabel = cluster.first_move_san ?? cluster.first_move;

      const prompt = {
        type: "explain_search_tree",
        explanation_level: explanationLevel,
        user_question: isMain
          ? `Why is ${moveLabel} the main idea?`
          : `Why did the engine reject ${moveLabel}?`,
        position_fen: tree.fen,
        depth: tree.depth,
        main_idea: main
          ? {
              label: main.label,
              first_move: main.first_move_san ?? main.first_move,
              first_move_uci: main.first_move,
              score: formatScoreData(main.best_score),
              ideas: main.ideas,
              summary: main.summary,
              pv_san: main.lines[0]?.pv_san ?? [],
            }
          : null,
        cluster: {
          id: cluster.id,
          label: cluster.label,
          category: cluster.category,
          first_move: cluster.first_move_san ?? cluster.first_move,
          first_move_uci: cluster.first_move,
          score: formatScoreData(cluster.best_score),
          eval_gap_cp: cluster.eval_gap_cp,
          ideas: cluster.ideas,
          why_rejected: cluster.why_rejected,
          summary: cluster.summary,
          pv_san: cluster.lines[0]?.pv_san ?? [],
        },
        all_clusters: tree.clusters.map((c) => ({
          id: c.id,
          label: c.label,
          category: c.category,
          first_move: c.first_move_san ?? c.first_move,
          score: formatScoreData(c.best_score),
          eval_gap_cp: c.eval_gap_cp,
        })),
      };

      const systemPrompt = `You are a chess coach explaining how an engine evaluates candidate moves to a club-level player.

CRITICAL RULES:
- You may ONLY explain the supplied structured search-tree data.
- Do NOT invent moves, variations, or calculations beyond the supplied PVs and reasons.
- Reference only the supplied ideas, why_rejected reasons, scores, and summaries.
- If evidence is insufficient, say so.
- Always write moves in standard algebraic notation (SAN), e.g. Nf3, O-O, Bxe5+, not UCI like g1f3.
- Prefer first_move / pv_san (SAN). Ignore *_uci unless the user asks for engine coordinates.
- Match the requested explanation level.
- For rejected lines, focus on concrete reasons the engine prefers the main idea.
- For the main idea, explain what strategic/tactical goals it pursues.`;

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
            setSearchTreeExplanation(cluster.id, accumulated);
          },
        });
        setSearchTreeExplanation(cluster.id, full || accumulated);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to explain line";
        setSearchTreeExplanation(cluster.id, `Error: ${message}`);
      } finally {
        setSearchTreeExplainingId(null);
      }
    },
    [
      tree,
      explanationLevel,
      getLLMConfig,
      setSettingsOpen,
      setSearchTreeExplanation,
      setSearchTreeExplainingId,
    ],
  );

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (loading && !tree) {
    return (
      <div className="search-tree-view search-tree-loading">
        Clustering engine lines…
      </div>
    );
  }

  if (error && !tree) {
    return (
      <div className="search-tree-view search-tree-error">
        <span>{error}</span>
        <button type="button" className="search-tree-dismiss" onClick={dismissSearchTree}>
          ✕
        </button>
      </div>
    );
  }

  if (!tree || tree.clusters.length === 0) return null;

  return (
    <div className="search-tree-view">
      <div className="search-tree-header">
        <span className="search-tree-title">Search tree</span>
        <span className="search-tree-depth">d{tree.depth}</span>
        <button
          type="button"
          className="search-tree-dismiss"
          onClick={dismissSearchTree}
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      <div className="search-tree-clusters">
        {tree.clusters.map((cluster) => (
          <ClusterRow
            key={cluster.id}
            cluster={cluster}
            expanded={Boolean(expanded[cluster.id]) || cluster.category === "main"}
            onToggle={() => toggle(cluster.id)}
            explanation={explanations[cluster.id]}
            explaining={explainingId === cluster.id}
            onExplain={() => void handleExplain(cluster)}
            onPlayMove={handlePlayMove}
          />
        ))}
      </div>
    </div>
  );
}
