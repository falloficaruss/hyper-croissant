import { useEffect, useRef } from "react";
import { useCoachStore } from "../../stores/coachStore";
import { MarkdownContent } from "../LLM/MarkdownContent";
import "../LLM/LLM.css";
import "./Coach.css";

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  input: string;
  setInput: (v: string) => void;
}

export function CoachConversation({ onSend, onStop, input, setInput }: Props) {
  const session = useCoachStore((s) => s.session);
  const streaming = useCoachStore((s) => s.streaming);
  const analyzing = useCoachStore((s) => s.analyzing);
  const error = useCoachStore((s) => s.error);
  const phase = useCoachStore((s) => s.phase);
  const bottomRef = useRef<HTMLDivElement>(null);

  const entries = session?.entries;
  const entryCount = entries?.length ?? 0;
  const lastContent = entries?.[entryCount - 1]?.content ?? "";
  const busy = streaming || analyzing;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entryCount, lastContent, streaming, analyzing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !busy && input.trim()) {
      e.preventDefault();
      onSend(input.trim());
    }
  };

  return (
    <div className="coach-conversation-wrap">
      <div className="explanation-conversation coach-conversation">
        {phase === "ready" && entryCount === 0 && !analyzing && (
          <div className="explanation-empty">
            Start a coaching session. The engine analysis stays hidden while your
            coach asks questions about the position.
          </div>
        )}

        {analyzing && entryCount === 0 && (
          <div className="explanation-empty">Preparing coaching session…</div>
        )}

        {(entries ?? []).map((entry, idx) => {
          const isLast = idx === entryCount - 1;
          const showCursor =
            streaming && isLast && entry.role === "assistant" && !entry.content;
          return (
            <div
              key={entry.id}
              className={`explanation-message explanation-${entry.role}`}
            >
              <div className="explanation-message-role">
                {entry.role === "assistant" ? "Coach" : "You"}
              </div>
              {entry.role === "assistant" ? (
                entry.content ? (
                  <MarkdownContent
                    content={entry.content}
                    className="explanation-message-content"
                    showCursor={streaming && isLast}
                  />
                ) : showCursor ? (
                  <div className="explanation-message-content">
                    <span className="explanation-cursor">▊</span>
                  </div>
                ) : null
              ) : (
                <div className="explanation-message-content">{entry.content}</div>
              )}
            </div>
          );
        })}

        {error && (
          <div className="explanation-error">
            <span className="explanation-error-icon">⚠</span>
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {(phase === "coaching" || phase === "revealed") && (
        <div className="explanation-input-area">
          <input
            className="explanation-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              phase === "revealed"
                ? "Ask a follow-up…"
                : "Your thoughts on the position…"
            }
            disabled={busy}
          />
          {streaming ? (
            <button
              className="explanation-stop-btn"
              onClick={onStop}
              type="button"
            >
              Stop
            </button>
          ) : (
            <button
              className="explanation-send-btn"
              onClick={() => input.trim() && onSend(input.trim())}
              disabled={busy || !input.trim()}
              type="button"
            >
              Send
            </button>
          )}
        </div>
      )}
    </div>
  );
}
