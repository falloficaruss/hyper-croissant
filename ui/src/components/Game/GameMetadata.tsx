import { useGameStore } from "../../stores/gameStore";
import "./Game.css";

export function GameMetadata() {
  const gameData = useGameStore((s) => s.gameData);
  const savedGameId = useGameStore((s) => s.savedGameId);
  const isDirty = useGameStore((s) => s.isDirty);
  const moves = useGameStore((s) => s.moves);

  if (!gameData && moves.length === 0) {
    return null;
  }

  const h = gameData?.headers;
  const white = h?.white?.trim() || "White";
  const black = h?.black?.trim() || "Black";
  const parts: string[] = [];
  if (h?.result) parts.push(h.result);
  if (h?.eco) parts.push(h.eco);
  if (h?.date) parts.push(h.date);
  if (h?.event) parts.push(h.event);
  if (h?.round) parts.push(`Rd ${h.round}`);

  return (
    <div className="game-metadata">
      <div className="game-metadata-players">
        <span className="game-metadata-white">{white}</span>
        <span className="game-metadata-vs">vs</span>
        <span className="game-metadata-black">{black}</span>
      </div>
      {parts.length > 0 && (
        <div className="game-metadata-line">{parts.join(" · ")}</div>
      )}
      <div className="game-metadata-status">
        {savedGameId != null ? (
          <span className="game-badge saved">
            Saved #{savedGameId}
            {isDirty ? " · edited" : ""}
          </span>
        ) : (
          <span className="game-badge unsaved">Unsaved</span>
        )}
      </div>
    </div>
  );
}
