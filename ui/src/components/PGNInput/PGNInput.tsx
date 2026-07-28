import { useState } from "react";
import { useGameStore } from "../../stores/gameStore";

export function PGNInput() {
  const [pgn, setPgn] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const loadFromPGN = useGameStore((s) => s.loadFromPGN);
  const isLoading = useGameStore((s) => s.isLoading);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);
  const moves = useGameStore((s) => s.moves);
  const gameData = useGameStore((s) => s.gameData);

  function handleLoad() {
    if (!pgn.trim()) return;
    clearError();
    void loadFromPGN(pgn);
  }

  const hasGame = moves.length > 0 || gameData != null;

  return (
    <div className={`pgn-input${hasGame ? " loaded" : ""}`}>
      <button
        type="button"
        className="pgn-collapse-toggle"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="pgn-label">Paste PGN</span>
        <span className="pgn-chevron" aria-hidden>
          {collapsed ? "▸" : "▾"}
        </span>
      </button>

      {!collapsed && (
        <>
          <textarea
            id="pgn-textarea"
            className="pgn-textarea"
            placeholder="1. e4 e5 2. Nf3 Nc6 ..."
            value={pgn}
            onChange={(e) => {
              setPgn(e.target.value);
              if (error) clearError();
            }}
            rows={3}
          />
          <button
            className="pgn-load-btn"
            onClick={handleLoad}
            disabled={isLoading || !pgn.trim()}
            type="button"
          >
            {isLoading ? "Loading..." : "Load on Board"}
          </button>
        </>
      )}
    </div>
  );
}
