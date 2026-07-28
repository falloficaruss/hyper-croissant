import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { SavedGameSummary } from "../../types/chess";
import "./Game.css";

function playerLabel(g: SavedGameSummary): string {
  const white = g.white?.trim() || "White";
  const black = g.black?.trim() || "Black";
  return `${white} vs ${black}`;
}

function metaLine(g: SavedGameSummary): string {
  const parts: string[] = [];
  if (g.result) parts.push(g.result);
  if (g.eco) parts.push(g.eco);
  if (g.date) parts.push(g.date);
  if (g.event) parts.push(g.event);
  parts.push(`${g.move_count} ply`);
  return parts.join(" · ");
}

export function GameList() {
  const library = useGameStore((s) => s.library);
  const libraryQuery = useGameStore((s) => s.libraryQuery);
  const libraryLoading = useGameStore((s) => s.libraryLoading);
  const libraryError = useGameStore((s) => s.libraryError);
  const savedGameId = useGameStore((s) => s.savedGameId);
  const refreshLibrary = useGameStore((s) => s.refreshLibrary);
  const setLibraryQuery = useGameStore((s) => s.setLibraryQuery);
  const loadSavedGame = useGameStore((s) => s.loadSavedGame);
  const deleteSavedGame = useGameStore((s) => s.deleteSavedGame);
  const importPgnText = useGameStore((s) => s.importPgnText);
  const exportSavedPgn = useGameStore((s) => s.exportSavedPgn);
  const isDirty = useGameStore((s) => s.isDirty);

  const [collapsed, setCollapsed] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  function handleSearchChange(value: string) {
    setLibraryQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void refreshLibrary(value);
    }, 250);
  }

  async function handleSelect(id: number) {
    if (isDirty && savedGameId !== id) {
      const ok = window.confirm(
        "You have unsaved changes. Load this game anyway?",
      );
      if (!ok) return;
    }
    await loadSavedGame(id);
  }

  async function handleDelete(e: MouseEvent, id: number) {
    e.stopPropagation();
    const ok = window.confirm("Delete this game from the library?");
    if (!ok) return;
    await deleteSavedGame(id);
  }

  async function handleExport(e: MouseEvent, id: number) {
    e.stopPropagation();
    try {
      const pgn = await exportSavedPgn(id);
      await navigator.clipboard.writeText(pgn);
      setImportMsg("PGN copied to clipboard");
      setTimeout(() => setImportMsg(null), 2000);
    } catch {
      setImportMsg("Failed to export PGN");
      setTimeout(() => setImportMsg(null), 2000);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const count = await importPgnText(text);
      setImportMsg(
        count === 1 ? "Imported 1 game" : `Imported ${count} games`,
      );
      setTimeout(() => setImportMsg(null), 2500);
    } catch {
      setImportMsg("Import failed");
      setTimeout(() => setImportMsg(null), 2500);
    }
  }

  return (
    <div className="game-list">
      <div className="game-list-header">
        <button
          type="button"
          className="game-list-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <span className="game-list-title">Library</span>
          <span className="game-list-count">
            {libraryLoading ? "…" : library.length}
          </span>
          <span className="game-list-chevron" aria-hidden>
            {collapsed ? "▸" : "▾"}
          </span>
        </button>
        <div className="game-list-actions">
          <button
            type="button"
            className="game-btn game-btn-sm"
            title="Import PGN file"
            onClick={() => fileInputRef.current?.click()}
            disabled={libraryLoading}
          >
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pgn,text/plain"
            className="game-file-input"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {!collapsed && (
        <>
          <input
            type="search"
            className="game-search"
            placeholder="Search player, ECO, date…"
            value={libraryQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />

          {libraryError && (
            <div className="game-error">{libraryError}</div>
          )}
          {importMsg && <div className="game-info">{importMsg}</div>}

          <div className="game-list-body">
            {library.length === 0 && !libraryLoading && (
              <div className="game-list-empty">
                No saved games yet. Save the current game or import a PGN.
              </div>
            )}
            {library.map((g) => (
              <div
                key={g.id}
                className={`game-list-item${savedGameId === g.id ? " active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => void handleSelect(g.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void handleSelect(g.id);
                  }
                }}
              >
                <div className="game-list-item-main">
                  <div className="game-list-players">{playerLabel(g)}</div>
                  <div className="game-list-meta">{metaLine(g)}</div>
                </div>
                <div className="game-list-item-actions">
                  <button
                    type="button"
                    className="game-icon-btn"
                    title="Copy PGN"
                    onClick={(e) => void handleExport(e, g.id)}
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    className="game-icon-btn danger"
                    title="Delete"
                    onClick={(e) => void handleDelete(e, g.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
