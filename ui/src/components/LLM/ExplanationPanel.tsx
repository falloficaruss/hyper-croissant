import { useState, useRef, useEffect, useCallback } from "react";
import "./LLM.css";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameStore } from "../../stores/gameStore";
import { useEngineStore } from "../../stores/engineStore";
import { getProviderOrThrow } from "../../lib/llm";
import { formatScore } from "../../types/engine";
import { ExplanationLevel } from "./ExplanationLevel";
import { LLMSettings } from "./LLMSettings";
import type { ConversationEntry } from "../../types/llm";

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
    if (!config.apiKey && config.provider !== "ollama") {
      setError("Please configure an API key in LLM Settings");
      setSettingsOpen(true);
      return;
    }

    const provider = getProviderOrThrow(config.provider);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setStreaming(true);
    setError(null);

    const userMessage: ConversationEntry = {
      id: generateId(),
      role: "user",
      content: input || "Explain this position for a club-level player.",
      timestamp: Date.now(),
    };

    setConversation((prev) => [...prev, userMessage]);
    setInput("");

    // Build the messages payload
    const structuredAnalysis: Record<string, any> = {
      type: "explain_position",
      fen,
      explanation_level: explanationLevel,
      user_question: userMessage.content,
    };

    if (bestLine) {
      structuredAnalysis.engine_evaluation = formatScore(bestLine.score);
      structuredAnalysis.best_line = bestLine.pv.join(" ");
    }

    const messages = [
      { role: "system" as const, content: systemPrompt },
      {
        role: "user" as const,
        content: JSON.stringify(structuredAnalysis),
      },
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
  }, [fen, input, explanationLevel, getLLMConfig, systemPrompt, setSettingsOpen, bestLine]);

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
    if (e.key === "Enter" && !e.shiftKey && !streaming) {
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
        {conversation.length === 0 && !error && (
          <div className="explanation-empty">
            Ask a question about this position to get an AI-powered explanation.
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
          disabled={streaming}
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
            disabled={streaming}
            type="button"
          >
            Ask
          </button>
        )}
      </div>
    </div>
  );
}
