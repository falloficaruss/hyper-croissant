import { useState, useRef, useEffect, useCallback } from "react";
import "./LLM.css";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameStore } from "../../stores/gameStore";
import { useEngineStore } from "../../stores/engineStore";
import { resolveProvider } from "../../lib/llm";
import { analyzePosition } from "../../lib/tauri";
import { ExplanationLevel } from "./ExplanationLevel";
import { LLMSettings } from "./LLMSettings";
import type { ConversationEntry } from "../../types/llm";
import type { EngineLineInfo, StructuredAnalysis } from "../../types/analysis";

interface Props {
  systemPrompt?: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are a chess coach explaining positions to a club-level player.

CRITICAL RULES:
- You may ONLY explain the supplied structured analysis.
- Do NOT invent moves, variations, or calculations.
- Reference only the supplied concepts, tactics, and plan.
- If evidence is insufficient, say so.
- Use standard algebraic notation (SAN).
- Match the requested explanation level.

Explanation levels:
- Beginner: Simple language, focus on "what" not "why". One idea per sentence.
- Intermediate: Name tactical/positional concepts. Explain "why" briefly.
- Advanced: Reference pawn structure, piece activity, long-term implications.
- Master: Full technical analysis with variations.`;

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function ExplanationPanel({ systemPrompt = DEFAULT_SYSTEM_PROMPT }: Props) {
  const explanationLevel = useSettingsStore((s) => s.explanationLevel);
  const setExplanationLevel = useSettingsStore((s) => s.setExplanationLevel);
  const getLLMConfig = useSettingsStore((s) => s.getLLMConfig);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);

  const fen = useGameStore((s) => s.fen);
  const engineLines = useEngineStore((s) => s.analysisLines);
  const bestLine = engineLines.length > 0 ? engineLines[0] : null;

  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Reset conversation when position changes
  const fenRef = useRef(fen);
  useEffect(() => {
    if (fenRef.current !== fen) {
      fenRef.current = fen;
      setConversation([]);
      setError(null);
    }
  }, [fen]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, streaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleExplainPosition = useCallback(async () => {
    const config = getLLMConfig();
    if (!config.useProxy && !config.apiKey && config.provider !== "ollama") {
      setError("Please configure an API key in LLM Settings");
      setSettingsOpen(true);
      return;
    }

    const provider = resolveProvider(config);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const question = input || "Explain this position for a club-level player.";
    setStreaming(true);
    setError(null);
    setInput("");

    const userMessage: ConversationEntry = {
      id: generateId(),
      role: "user",
      content: question,
      timestamp: Date.now(),
    };

    setConversation((prev) => [...prev, userMessage]);

    // Call the intelligence layer
    setAnalyzing(true);
    let analysis: StructuredAnalysis | null = null;
    try {
      const analysisInput: EngineLineInfo[] = engineLines.map((l) => ({
        depth: l.depth,
        score:
          l.score.type === "Cp"
            ? { kind: "cp", value: l.score.value }
            : { kind: "mate", value: l.score.value },
        pv: l.pv,
        multipv: l.multipv,
      }));
      analysis = await analyzePosition(fen, analysisInput);
    } catch {
      // Intelligence layer failed; fall back to simple prompt
    }
    setAnalyzing(false);

    // Build the prompt
    const best = bestLine;
    const promptJson = (() => {
      if (!analysis) {
        const fallback: Record<string, unknown> = {
          type: "explain_position",
          fen,
          explanation_level: explanationLevel,
          user_question: question,
        };
        if (best) {
          fallback.best_move = best.pv[0] ?? "";
          fallback.evaluation =
            best.score.type === "Cp"
              ? `${(best.score.value / 100).toFixed(2)}`
              : `mate in ${best.score.value}`;
          fallback.best_line = best.pv.join(" ");
        }
        return JSON.stringify(fallback);
      }

      const lines = analysis.engine_lines;
      const bestMove = lines.length > 0 ? lines[0].pv[0] ?? "" : "";
      const evalStr =
        lines.length > 0
          ? lines[0].score.kind === "cp"
            ? `${(lines[0].score.value / 100).toFixed(2)}`
            : `mate in ${lines[0].score.value}`
          : "";
      const diffToSecond =
        lines.length >= 2 &&
        lines[0].score.kind === "cp" &&
        lines[1].score.kind === "cp"
          ? Math.abs(lines[0].score.value - lines[1].score.value) / 100
          : 0;

      return JSON.stringify({
        type: "explain_position",
        fen: analysis.fen,
        best_move: bestMove,
        evaluation: evalStr,
        difference_to_second: diffToSecond,
        concepts: {
          initiative: analysis.concepts.initiative,
          tempo_advantage: analysis.concepts.tempo_advantage,
          key_ideas: analysis.concepts.key_ideas,
          plan: analysis.concepts.plan,
          strategic_summary: analysis.concepts.strategic_summary,
        },
        tactics: analysis.tactics.map((t) => t.description),
        explanation_level: explanationLevel,
        user_question: question,
      });
    })();

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: promptJson },
    ];

    const assistantEntry: ConversationEntry = {
      id: generateId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setConversation((prev) => [...prev, assistantEntry]);

    try {
      const full = await provider.chat({
        systemPrompt,
        messages: messages.slice(1),
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        signal: abortRef.current.signal,
        onChunk: (text) => {
          setConversation((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: last.content + text };
            }
            return updated;
          });
        },
      });

      // Ensure final content is set
      setConversation((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === "assistant" && last.content !== full) {
          updated[updated.length - 1] = { ...last, content: full };
        }
        return updated;
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Failed to get explanation";
      setError(message);
      // Remove incomplete assistant entry
      setConversation((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }, [fen, input, explanationLevel, getLLMConfig, systemPrompt, setSettingsOpen, bestLine, engineLines]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const handleCopyAnalysis = useCallback(() => {
    const text = conversation
      .map((e) => `[${e.role.toUpperCase()}]\n${e.content}`)
      .join("\n\n");
    navigator.clipboard.writeText(text).catch(() => {
      // ignore clipboard errors
    });
  }, [conversation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !streaming && !analyzing) {
      e.preventDefault();
      handleExplainPosition();
    }
  };

  return (
    <div className="explanation-panel">
      {/* Header */}
      <div className="explanation-header">
        <span className="explanation-title">Coach</span>
        <button
          className="explanation-settings-btn"
          onClick={() => setSettingsOpen(!settingsOpen)}
          type="button"
          title="LLM Settings"
        >
          ⚙
        </button>
      </div>

      {/* Level selector */}
      <ExplanationLevel value={explanationLevel} onChange={setExplanationLevel} />

      {/* Settings modal */}
      <LLMSettings />

      {/* Conversation */}
      <div className="explanation-conversation">
        {conversation.length === 0 && !error && !analyzing && (
          <div className="explanation-empty">
            Ask a question about this position to get an AI-powered explanation.
          </div>
        )}

        {analyzing && conversation.length === 0 && (
          <div className="explanation-empty">
            Analyzing position...
          </div>
        )}

        {conversation.map((entry) => (
          <div key={entry.id} className={`explanation-message explanation-${entry.role}`}>
            <div className="explanation-message-role">
              {entry.role === "assistant" ? "Coach" : "You"}
            </div>
            <div className="explanation-message-content">
              {entry.content || (streaming && entry === conversation[conversation.length - 1] ? (
                <span className="explanation-cursor">▊</span>
              ) : (
                entry.content
              ))}
            </div>
          </div>
        ))}

        {error && (
          <div className="explanation-error">
            <span className="explanation-error-icon">⚠</span>
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Actions */}
      <div className="explanation-actions">
        {conversation.length > 0 && (
          <button
            className="explanation-copy-btn"
            onClick={handleCopyAnalysis}
            type="button"
            title="Copy conversation"
          >
            📋 Copy
          </button>
        )}
      </div>

      {/* Input */}
      <div className="explanation-input-area">
        <input
          className="explanation-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this position..."
          disabled={streaming || analyzing}
        />
        {streaming ? (
          <button
            className="explanation-stop-btn"
            onClick={handleStop}
            type="button"
          >
            Stop
          </button>
        ) : (
          <button
            className="explanation-send-btn"
            onClick={handleExplainPosition}
            disabled={streaming || analyzing}
            type="button"
          >
            Ask
          </button>
        )}
      </div>
    </div>
  );
}
