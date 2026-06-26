import { useGameStore } from "../../stores/gameStore";

export function PositionInfo() {
  const fen = useGameStore((s) => s.fen);
  const turn = useGameStore((s) => s.turn);
  const isCheck = useGameStore((s) => s.isCheck);
  const isCheckmate = useGameStore((s) => s.isCheckmate);
  const isStalemate = useGameStore((s) => s.isStalemate);
  const currentMoveIndex = useGameStore((s) => s.currentMoveIndex);
  const gameData = useGameStore((s) => s.gameData);

  const moveNumber = Math.floor(currentMoveIndex / 2) + 1;

  return (
    <div className="position-info">
      <div className="turn-indicator">
        <span className={`turn-dot ${turn}`} />
        <span>{turn === "w" ? "White" : "Black"} to move</span>
      </div>

      <div className="status-badges">
        {isCheckmate && <span className="badge badge-mate">Checkmate</span>}
        {isCheck && !isCheckmate && <span className="badge badge-check">Check</span>}
        {isStalemate && <span className="badge badge-stalemate">Stalemate</span>}
      </div>

      <div className="move-count">Move {moveNumber}</div>

      <div className="fen-display">
        <span className="fen-label">FEN</span>
        <code className="fen-value">{fen}</code>
      </div>

      {gameData && (
        <div className="game-headers">
          {gameData.headers.white && (
            <div className="header-row">
              <span className="header-label">White</span>
              <span>{gameData.headers.white}</span>
            </div>
          )}
          {gameData.headers.black && (
            <div className="header-row">
              <span className="header-label">Black</span>
              <span>{gameData.headers.black}</span>
            </div>
          )}
          {gameData.headers.event && (
            <div className="header-row">
              <span className="header-label">Event</span>
              <span>{gameData.headers.event}</span>
            </div>
          )}
          {gameData.headers.result && (
            <div className="header-row">
              <span className="header-label">Result</span>
              <span>{gameData.headers.result}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
