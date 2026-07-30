import { useCallback, useEffect, useRef, useState } from "react";
import { useCoachStore, generateCoachEntryId } from "../../stores/coachStore";
import { useGameStore } from "../../stores/gameStore";
import { useEngineStore } from "../../stores/engineStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { resolveProvider } from "../../lib/llm";
import { analyzePosition } from "../../lib/tauri";
import { LLMSettings } from "../LLM/LLMSettings";
import { ExplanationLevel } from "../LLM/ExplanationLevel";
import { CoachConversation } from "./CoachConversation";
import {
  COACH_REVEAL_SYSTEM_ADDENDUM,
  COACH_SYSTEM_PROMPT,
  buildCoachUserPrompt,
} from "./coachPrompts";
import type { EngineLineInfo, StructuredAnalysis } from "../../types/analysis";
import type { AnalysisLine } from "../../types/engine";
import type { ConversationEntry } from "../../types/llm";
import "../LLM/LLM.css";
import "./Coach.css";

function toEngineLineInfo(lines: AnalysisLine[]): EngineLineInfo[] {
  return lines.map((l) => ({
    depth: l.depth,
    score:
      l.score.type === "Cp"
        ? { kind: "cp" as const, value: l.score.value }
        : { kind: "mate" as const, value: l.score.value },
    pv: l.pv,
    multipv: l.multipv,
  }));
}

export function CoachMode() {
  const enabled = useCoachStore((s) => s.enabled);
  const phase = useCoachStore((s) => s.phase);
  const session = useCoachStore((s) => s.session);
  const streaming = useCoachStore((s) => s.streaming);
  const analyzing = useCoachStore((s) => s.analyzing);

  const setEnabled = useCoachStore((s) => s.setEnabled);
  const startSession = useCoachStore((s) => s.startSession);
  const appendEntry = useCoachStore((s) => s.appendEntry);
  const updateLastAssistant = useCoachStore((s) => s.updateLastAssistant);
  const setAnalysis = useCoachStore((s) => s.setAnalysis);
  const revealAnswer = useCoachStore((s) => s.revealAnswer);
  const endSession = useCoachStore((s) => s.endSession);
  const onPositionChange = useCoachStore((s) => s.onPositionChange);
  const setStreaming = useCoachStore((s) => s.setStreaming);
  const setAnalyzing = useCoachStore((s) => s.setAnalyzing);
  const setError = useCoachStore((s) => s.setError);

  const fen = useGameStore((s) => s.fen);
  const engineLines = useEngineStore((s) => s.analysisLines);
  const engineRunning = useEngineStore((s) => s.engineRunning);

  const explanationLevel = useSettingsStore((s) => s.explanationLevel);
  const setExplanationLevel = useSettingsStore((s) => s.setExplanationLevel);
  const getLLMConfig = useSettingsStore((s) => s.getLLMConfig);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);

  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const fenRef = useRef(fen);

  // Reset session context when position changes
  useEffect(() => {
    if (fenRef.current !== fen) {
      fenRef.current = fen;
      abortRef.current?.abort();
      setStreaming(false);
      setAnalyzing(false);
      setInput("");
      onPositionChange(fen);
    }
  }, [fen, onPositionChange, setStreaming, setAnalyzing]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const ensureApiKey = useCallback((): boolean => {
    const config = getLLMConfig();
    if (!config.useProxy && !config.apiKey && config.provider !== "ollama") {
      setError("Please configure an API key in LLM Settings");
      setSettingsOpen(true);
      return false;
    }
    return true;
  }, [getLLMConfig, setError, setSettingsOpen]);

  const fetchAnalysis = useCallback(async (): Promise<StructuredAnalysis | null> => {
    try {
      return await analyzePosition(fen, toEngineLineInfo(engineLines));
    } catch {
      return null;
    }
  }, [fen, engineLines]);

  const runCoachTurn = useCallback(
    async (opts: {
      userMessage?: string;
      isReveal?: boolean;
      analysisOverride?: StructuredAnalysis | null;
      entriesOverride?: ConversationEntry[];
      revealedOverride?: boolean;
    }) => {
      if (!ensureApiKey()) return;

      const config = getLLMConfig();
      const provider = resolveProvider(config);
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const current = useCoachStore.getState().session;
      const entries = opts.entriesOverride ?? current?.entries ?? [];
      const revealed =
        opts.revealedOverride ?? current?.revealed ?? Boolean(opts.isReveal);
      let analysis =
        opts.analysisOverride !== undefined
          ? opts.analysisOverride
          : (current?.analysis ?? null);

      setStreaming(true);
      setError(null);

      if (opts.userMessage) {
        appendEntry({
          id: generateCoachEntryId(),
          role: "user",
          content: opts.userMessage,
          timestamp: Date.now(),
        });
        setInput("");
      }

      // Refresh analysis if missing
      if (!analysis) {
        setAnalyzing(true);
        analysis = await fetchAnalysis();
        setAnalyzing(false);
        if (analysis) setAnalysis(analysis);
      }

      const promptJson = buildCoachUserPrompt({
        analysis,
        fen,
        explanationLevel,
        entries: opts.userMessage
          ? [
              ...entries,
              {
                id: "pending",
                role: "user",
                content: opts.userMessage,
                timestamp: Date.now(),
              },
            ]
          : entries,
        revealed,
        userMessage: opts.userMessage,
        isReveal: opts.isReveal,
      });

      const systemPrompt =
        COACH_SYSTEM_PROMPT +
        (opts.isReveal || revealed ? COACH_REVEAL_SYSTEM_ADDENDUM : "");

      // Include prior conversation as chat messages for better multi-turn context
      const chatMessages: { role: "user" | "assistant"; content: string }[] = [];
      for (const e of entries) {
        if (e.content) {
          chatMessages.push({ role: e.role, content: e.content });
        }
      }
      // Latest structured prompt as the driving user message
      chatMessages.push({ role: "user", content: promptJson });

      appendEntry({
        id: generateCoachEntryId(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      });

      try {
        const full = await provider.chat({
          systemPrompt,
          messages: chatMessages,
          model: config.model,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          signal: abortRef.current.signal,
          onChunk: (text) => {
            const sess = useCoachStore.getState().session;
            const last = sess?.entries[sess.entries.length - 1];
            if (last && last.role === "assistant") {
              updateLastAssistant(last.content + text);
            }
          },
        });

        const sess = useCoachStore.getState().session;
        const last = sess?.entries[sess.entries.length - 1];
        if (last && last.role === "assistant" && last.content !== full) {
          updateLastAssistant(full);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Failed to get coach response";
        setError(message);
        // Drop incomplete assistant entry
        const sess = useCoachStore.getState().session;
        if (sess && sess.entries.length > 0) {
          const last = sess.entries[sess.entries.length - 1];
          if (last.role === "assistant" && !last.content) {
            useCoachStore.setState({
              session: {
                ...sess,
                entries: sess.entries.slice(0, -1),
              },
            });
          }
        }
      } finally {
        setStreaming(false);
      }
    },
    [
      ensureApiKey,
      getLLMConfig,
      fen,
      explanationLevel,
      appendEntry,
      updateLastAssistant,
      setAnalysis,
      setAnalyzing,
      setStreaming,
      setError,
      fetchAnalysis,
    ],
  );

  const handleStart = useCallback(async () => {
    if (!ensureApiKey()) return;

    setAnalyzing(true);
    setError(null);
    const analysis = await fetchAnalysis();
    setAnalyzing(false);

    startSession(fen, analysis);

    // If resuming a session with history, don't re-ask opening question
    const sess = useCoachStore.getState().session;
    if (sess && sess.entries.length > 0) return;

    await runCoachTurn({ analysisOverride: analysis, entriesOverride: [] });
  }, [
    ensureApiKey,
    fetchAnalysis,
    fen,
    startSession,
    runCoachTurn,
    setAnalyzing,
    setError,
  ]);

  const handleSend = useCallback(
    (text: string) => {
      void runCoachTurn({ userMessage: text });
    },
    [runCoachTurn],
  );

  const handleReveal = useCallback(async () => {
    revealAnswer();
    await runCoachTurn({
      isReveal: true,
      revealedOverride: true,
      userMessage: "Please reveal the full answer and explain the position.",
    });
  }, [revealAnswer, runCoachTurn]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, [setStreaming]);

  const handleToggle = useCallback(() => {
    abortRef.current?.abort();
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  const handleCopy = useCallback(() => {
    const entries = session?.entries ?? [];
    const text = entries
      .map((e) => `[${e.role.toUpperCase()}]\n${e.content}`)
      .join("\n\n");
    navigator.clipboard.writeText(text).catch(() => {
      // ignore
    });
  }, [session]);

  if (!enabled) {
    return (
      <div className="coach-mode coach-mode-collapsed">
        <div className="coach-mode-header">
          <span className="coach-mode-title">Coach Mode</span>
          <button
            type="button"
            className="coach-mode-toggle"
            onClick={handleToggle}
            title="Enter coach mode — hide analysis and practice with Socratic questions"
          >
            Enable
          </button>
        </div>
        <p className="coach-mode-hint">
          Hide engine lines and work through the position with a coach who asks
          before revealing.
        </p>
      </div>
    );
  }

  return (
    <div className="coach-mode coach-mode-active">
      <div className="coach-mode-header">
        <span className="coach-mode-title">
          Coach Mode
          <span className="coach-mode-badge">Active</span>
        </span>
        <div className="coach-mode-header-actions">
          <button
            className="explanation-settings-btn"
            onClick={() => setSettingsOpen(!settingsOpen)}
            type="button"
            title="LLM Settings"
          >
            ⚙
          </button>
          <button
            type="button"
            className="coach-mode-toggle coach-mode-toggle-exit"
            onClick={handleToggle}
            title="Exit coach mode"
          >
            Exit
          </button>
        </div>
      </div>

      <ExplanationLevel value={explanationLevel} onChange={setExplanationLevel} />
      <LLMSettings />

      {!engineRunning && phase === "ready" && (
        <div className="coach-mode-banner coach-mode-banner-warn">
          Start the engine for richer coaching (structured concepts &amp; tactics).
          You can still begin without it.
        </div>
      )}

      {phase === "revealed" && (
        <div className="coach-mode-banner coach-mode-banner-ok">
          Answer revealed — analysis panels are visible again.
        </div>
      )}

      <div className="coach-mode-actions">
        {phase === "ready" && (
          <button
            type="button"
            className="coach-action-btn coach-action-primary"
            onClick={() => void handleStart()}
            disabled={analyzing || streaming}
          >
            {analyzing ? "Preparing…" : "Start Session"}
          </button>
        )}

        {(phase === "coaching" || phase === "revealed") && (
          <>
            {phase === "coaching" && (
              <button
                type="button"
                className="coach-action-btn coach-action-reveal"
                onClick={() => void handleReveal()}
                disabled={streaming || analyzing}
                title="Reveal the full answer"
              >
                Reveal Answer
              </button>
            )}
            <button
              type="button"
              className="coach-action-btn"
              onClick={endSession}
              disabled={streaming}
            >
              End Session
            </button>
            {(session?.entries.length ?? 0) > 0 && (
              <button
                type="button"
                className="coach-action-btn"
                onClick={handleCopy}
              >
                Copy
              </button>
            )}
          </>
        )}
      </div>

      <CoachConversation
        onSend={handleSend}
        onStop={handleStop}
        input={input}
        setInput={setInput}
      />
    </div>
  );
}
