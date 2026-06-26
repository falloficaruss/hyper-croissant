import { useState } from "react";
import { useGameStore } from "../../stores/gameStore";

export function PGNInput() {
  const [pgn, setPgn] = useState("");
  const loadFromPGN = useGameStore((s) => s.loadFromPGN);
  const isLoading = useGameStore((s) => s.isLoading);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);
  const gameData = useGameStore((s) => s.gameData);

  function handleLoad() {
    if (!pgn.trim()) return;
    clearError();
    loadFromPGN(pgn);
  }

  if (gameData) {
    return (
      <div className="pgn-input loaded">
        <div className="pgn-loaded-info">
          Game loaded ({gameData.moves.length} moves)
        </div>
      </div>
    );
  }

  return (
    <div className="pgn-input">
      <label className="pgn-label" htmlFor="pgn-textarea">
        Paste PGN
      </label>
      <textarea
        id="pgn-textarea"
        className="pgn-textarea"
        placeholder="1. e4 e5 2. Nf3 Nc6 ..."
        value={pgn}
        onChange={(e) => {
          setPgn(e.target.value);
          if (error) clearError();
        }}
        rows={4}
      />
      <button
        className="pgn-load-btn"
        onClick={handleLoad}
        disabled={isLoading || !pgn.trim()}
      >
        {isLoading ? "Loading..." : "Load Game"}
      </button>
      {error && <div className="pgn-error">{error}</div>}
    </div>
  );
}
