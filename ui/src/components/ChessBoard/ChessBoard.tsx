import { Chessboard } from "react-chessboard";
import type { PieceDropHandlerArgs } from "react-chessboard";
import { useGameStore } from "../../stores/gameStore";

export function ChessBoard() {
  const fen = useGameStore((s) => s.fen);
  const boardFlipped = useGameStore((s) => s.boardFlipped);
  const lastMove = useGameStore((s) => s.lastMove);
  const isCheck = useGameStore((s) => s.isCheck);
  const makeMove = useGameStore((s) => s.makeMove);

  function onDrop({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs) {
    if (!targetSquare) return false;
    const pieceChar = piece.pieceType[1];
    const promotion =
      pieceChar === "p" && (targetSquare[1] === "8" || targetSquare[1] === "1")
        ? "q"
        : undefined;
    makeMove(sourceSquare, targetSquare, promotion);
    return true;
  }

  const arrows = lastMove
    ? [{ startSquare: lastMove.from, endSquare: lastMove.to, color: "#fff" }]
    : [];

  return (
    <div className="board-container">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: boardFlipped ? "black" : "white",
          onPieceDrop: onDrop,
          arrows,
          animationDurationInMs: 200,
          allowDragging: true,
          boardStyle: {
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          },
          darkSquareStyle: {
            backgroundColor: isCheck ? "#b02c2c" : "#779952",
          },
          lightSquareStyle: {
            backgroundColor: isCheck ? "#d45c5c" : "#e8edc8",
          },
        }}
      />
    </div>
  );
}
