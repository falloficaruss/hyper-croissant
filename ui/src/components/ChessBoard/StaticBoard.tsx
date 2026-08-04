import { Chessboard } from "react-chessboard";

export interface StaticBoardProps {
  /** Unique react-chessboard instance id (required when multiple boards mount). */
  id: string;
  fen: string;
  /** Board orientation; default "white". */
  orientation?: "white" | "black";
  /** Outer square size in px; default 140. */
  size?: number;
  /** Optional single highlight arrow (already-split squares). */
  arrow?: { from: string; to: string; color?: string } | null;
  className?: string;
  /** When set, entire board is a button that fires this (no piece drag). */
  onClick?: () => void;
  /** Accessible name for the button/board. */
  ariaLabel?: string;
}

export function StaticBoard({
  id,
  fen,
  orientation = "white",
  size = 140,
  arrow = null,
  className,
  onClick,
  ariaLabel,
}: StaticBoardProps) {
  const board = (
    <div
      className={className}
      style={{ width: size, height: size, maxWidth: "100%" }}
    >
      <Chessboard
        options={{
          id,
          position: fen,
          boardOrientation: orientation,
          allowDragging: false,
          allowDrawingArrows: false,
          showNotation: false,
          animationDurationInMs: 0,
          arrows:
            arrow && arrow.from && arrow.to
              ? [
                  {
                    startSquare: arrow.from,
                    endSquare: arrow.to,
                    color: arrow.color ?? "#fff",
                  },
                ]
              : [],
          boardStyle: {
            borderRadius: "4px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            width: "100%",
            height: "100%",
          },
          darkSquareStyle: { backgroundColor: "#779952" },
          lightSquareStyle: { backgroundColor: "#e8edc8" },
        }}
      />
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="static-board-btn"
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {board}
      </button>
    );
  }

  return board;
}
