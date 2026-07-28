import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useGameStore } from "../../stores/gameStore";
import "./Game.css";

export function GameControls() {
  const isLoading = useGameStore((s) => s.isLoading);
  const isDirty = useGameStore((s) => s.isDirty);
  const savedGameId = useGameStore((s) => s.savedGameId);
  const moves = useGameStore((s) => s.moves);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);

  const newGame = useGameStore((s) => s.newGame);
  const saveCurrentGame = useGameStore((s) => s.saveCurrentGame);
  const exportCurrentPgn = useGameStore((s) => s.exportCurrentPgn);
  const loadFromFen = useGameStore((s) => s.loadFromFen);
  const loadFromPGN = useGameStore((s) => s.loadFromPGN);

  const [status, setStatus] = useState<string | null>(null);
  const [showFen, setShowFen] = useState(false);
  const [fenInput, setFenInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    clearError();
    await saveCurrentGame();
    if (!useGameStore.getState().error) {
      setStatus(savedGameId != null && !isDirty ? "Saved" : "Game saved");
      setTimeout(() => setStatus(null), 2000);
    }
  }

  async function handleExport() {
    try {
      const pgn = await exportCurrentPgn();
      await navigator.clipboard.writeText(pgn);
      setStatus("PGN copied");
      setTimeout(() => setStatus(null), 2000);
    } catch {
      setStatus("Export failed");
      setTimeout(() => setStatus(null), 2000);
    }
  }

  function handleNew() {
    if (isDirty) {
      const ok = window.confirm("Discard unsaved changes and start a new game?");
      if (!ok) return;
    }
    newGame();
    setStatus(null);
    clearError();
  }

  async function handleOpenFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    clearError();
    const text = await file.text();
    await loadFromPGN(text);
  }

  function handleLoadFen() {
    if (!fenInput.trim()) return;
    clearError();
    loadFromFen(fenInput.trim());
    setShowFen(false);
    setFenInput("");
  }

  const canSave = moves.length > 0 || savedGameId != null;

  return (
    <div className="game-controls">
      <div className="game-controls-row">
        <button
          type="button"
          className="game-btn"
          onClick={handleNew}
          disabled={isLoading}
        >
          New
        </button>
        <button
          type="button"
          className="game-btn"
          onClick={() => fileRef.current?.click()}
          disabled={isLoading}
          title="Open a PGN file on the board"
        >
          Open
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pgn,text/plain"
          className="game-file-input"
          onChange={(e) => void handleOpenFile(e)}
        />
        <button
          type="button"
          className="game-btn primary"
          onClick={() => void handleSave()}
          disabled={isLoading || !canSave}
          title={
            savedGameId != null
              ? "Update saved game"
              : "Save current game to library"
          }
        >
          {isLoading ? "…" : "Save"}
        </button>
        <button
          type="button"
          className="game-btn"
          onClick={() => void handleExport()}
          disabled={isLoading || moves.length === 0}
          title="Copy current game PGN"
        >
          Export
        </button>
        <button
          type="button"
          className="game-btn"
          onClick={() => setShowFen((v) => !v)}
          disabled={isLoading}
          title="Load a position from FEN"
        >
          FEN
        </button>
      </div>

      {showFen && (
        <div className="game-fen-row">
          <input
            type="text"
            className="game-fen-input"
            placeholder="Paste FEN…"
            value={fenInput}
            onChange={(e) => setFenInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLoadFen();
            }}
          />
          <button
            type="button"
            className="game-btn game-btn-sm primary"
            onClick={handleLoadFen}
            disabled={!fenInput.trim()}
          >
            Load
          </button>
        </div>
      )}

      {status && <div className="game-info">{status}</div>}
      {error && <div className="game-error">{error}</div>}
    </div>
  );
}
