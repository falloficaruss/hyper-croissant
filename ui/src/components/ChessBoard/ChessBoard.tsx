import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { PieceDropHandlerArgs } from "react-chessboard";
import { useGameStore } from "../../stores/gameStore";
import { useEngineStore } from "../../stores/engineStore";

interface Props {
  /** Hide engine best-move arrow (coach mode). */
  hideBestMove?: boolean;
}

export function ChessBoard({ hideBestMove = false }: Props) {
  const fen = useGameStore((s) => s.fen);
  const boardFlipped = useGameStore((s) => s.boardFlipped);
  const lastMove = useGameStore((s) => s.lastMove);
  const isCheck = useGameStore((s) => s.isCheck);
  const makeMove = useGameStore((s) => s.makeMove);
  const bestMove = useEngineStore((s) => s.bestMove);

  const hostRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(480);

  const updateSize = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    // Prefer the board-area (parent of board-panel) so eval-bar width is excluded from the square budget.
    const area = host.closest(".board-area") as HTMLElement | null;
    const areaW = area?.clientWidth ?? host.clientWidth;
    const areaH = area?.clientHeight ?? host.clientHeight;
    const styles = area ? getComputedStyle(area) : null;
    const padX = styles
      ? parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)
      : 0;
    const padY = styles
      ? parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
      : 0;
    const gap = styles ? parseFloat(styles.columnGap || styles.gap || "0") || 0 : 0;
    const evalBarWidth = 40; // matches Layout.css .eval-bar width
    const availW = Math.max(0, areaW - padX - evalBarWidth - gap);
    const availH = Math.max(0, areaH - padY);
    const next = Math.floor(Math.max(200, Math.min(availW, availH)));
    if (area) area.style.setProperty("--board-size", `${next}px`);
    setBoardSize((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const area = host.closest(".board-area") ?? host;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      // Coalesce layout thrash to one paint frame.
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateSize();
      });
    });
    ro.observe(area);
    updateSize();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [updateSize]);

  const onDrop = useCallback(
    ({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
      if (!targetSquare) return false;
      const pieceChar = piece.pieceType[1];
      const promotion =
        pieceChar === "p" && (targetSquare[1] === "8" || targetSquare[1] === "1")
          ? "q"
          : undefined;
      makeMove(sourceSquare, targetSquare, promotion);
      return true;
    },
    [makeMove],
  );

  const arrows = useMemo(() => {
    const next = [];
    if (lastMove) {
      next.push({
        startSquare: lastMove.from,
        endSquare: lastMove.to,
        color: "rgba(255,255,255,0.65)",
      });
    }
    if (!hideBestMove && bestMove && bestMove.length >= 4) {
      next.push({
        startSquare: bestMove.slice(0, 2),
        endSquare: bestMove.slice(2, 4),
        color: "#8b5cf6",
      });
    }
    return next;
  }, [lastMove, hideBestMove, bestMove]);

  const options = useMemo(
    () => ({
      position: fen,
      boardOrientation: (boardFlipped ? "black" : "white") as "black" | "white",
      onPieceDrop: onDrop,
      arrows,
      // Snappier piece travel; 200ms felt laggy on every move/nav.
      animationDurationInMs: 90,
      showAnimations: true,
      allowDragging: true,
      // Avoid drag-start feeling sticky on trackpads.
      dragActivationDistance: 2,
      boardStyle: {
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        width: "100%",
        height: "100%",
      },
      darkSquareStyle: {
        backgroundColor: isCheck ? "#b02c2c" : "#779952",
      },
      lightSquareStyle: {
        backgroundColor: isCheck ? "#d45c5c" : "#e8edc8",
      },
    }),
    [fen, boardFlipped, onDrop, arrows, isCheck],
  );

  return (
    <div
      ref={hostRef}
      className="board-size-host"
      style={{
        ["--board-size" as string]: `${boardSize}px`,
        contain: "layout style",
      }}
    >
      <div className="board-container">
        <Chessboard options={options} />
      </div>
    </div>
  );
}
