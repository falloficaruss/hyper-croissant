import { useRef, useEffect } from "react";
import { useGameStore } from "../../stores/gameStore";

export function MoveList() {
  const moves = useGameStore((s) => s.moves);
  const currentMoveIndex = useGameStore((s) => s.currentMoveIndex);
  const navigateToMove = useGameStore((s) => s.navigateToMove);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentMoveIndex]);

  if (moves.length === 0) {
    return (
      <div className="move-list">
        <div className="move-list-empty">No moves yet</div>
      </div>
    );
  }

  const pairs: { n: number; w?: number; b?: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ n: Math.floor(i / 2) + 1, w: i, b: i + 1 < moves.length ? i + 1 : undefined });
  }

  return (
    <div className="move-list" ref={listRef}>
      {pairs.map((pair) => (
        <div key={pair.n} className="move-pair">
          <span className="move-number">{pair.n}.</span>
          <button
            ref={pair.w === currentMoveIndex ? activeRef : undefined}
            className={`move-btn${pair.w === currentMoveIndex ? " active" : ""}`}
            onClick={() => navigateToMove(pair.w!)}
          >
            {moves[pair.w!].san}
          </button>
          {pair.b !== undefined && (
            <button
              ref={pair.b === currentMoveIndex ? activeRef : undefined}
              className={`move-btn${pair.b === currentMoveIndex ? " active" : ""}`}
              onClick={() => navigateToMove(pair.b!)}
            >
              {moves[pair.b].san}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
