import { useMemo } from "react";
import type { AnalysisLine } from "../../types/engine";
import { formatScore } from "../../types/engine";
import { pvToSan } from "../../lib/chessNotation";
import { useGameStore } from "../../stores/gameStore";

interface PVLineProps {
  line: AnalysisLine;
  isBest: boolean;
  onPlayMove: (uci: string) => void;
}

export function PVLine({ line, isBest, onPlayMove }: PVLineProps) {
  const fen = useGameStore((s) => s.fen);
  const moves = line.pv.slice(0, 6);
  const hasMore = line.pv.length > 6;
  const sans = useMemo(
    () => pvToSan(fen, line.pv.slice(0, 6)),
    // line.pv identity changes every engine tick; join is a stable content key
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fen, line.pv.join(" ")],
  );

  return (
    <div className={`pv-line${isBest ? " pv-line-best" : ""}`}>
      <div className="pv-line-header">
        <span className="pv-line-rank">#{line.multipv}</span>
        <span className="pv-line-score">{formatScore(line.score)}</span>
        <span className="pv-line-depth">d{line.depth}</span>
      </div>
      <div className="pv-line-moves">
        {moves.map((move, i) => {
          const san = sans[i] ?? move;
          return (
            <span
              key={`${i}-${move}`}
              className="pv-move"
              onClick={() => onPlayMove(move)}
              title={`Play ${san}`}
            >
              {san}
            </span>
          );
        })}
        {hasMore && <span className="pv-more">...</span>}
      </div>
    </div>
  );
}
