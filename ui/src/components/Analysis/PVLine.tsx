import type { AnalysisLine } from "../../types/engine";
import { formatScore, uciToSan } from "../../types/engine";

interface PVLineProps {
  line: AnalysisLine;
  isBest: boolean;
  onPlayMove: (uci: string) => void;
}

export function PVLine({ line, isBest, onPlayMove }: PVLineProps) {
  const moves = line.pv.slice(0, 6);
  const hasMore = line.pv.length > 6;

  return (
    <div className={`pv-line${isBest ? " pv-line-best" : ""}`}>
      <div className="pv-line-header">
        <span className="pv-line-rank">#{line.multipv}</span>
        <span className="pv-line-score">{formatScore(line.score)}</span>
        <span className="pv-line-depth">d{line.depth}</span>
      </div>
      <div className="pv-line-moves">
        {moves.map((move, i) => (
          <span
            key={`${i}-${move}`}
            className="pv-move"
            onClick={() => onPlayMove(move)}
            title={`Play ${uciToSan(move)}`}
          >
            {uciToSan(move)}
          </span>
        ))}
        {hasMore && <span className="pv-more">...</span>}
      </div>
    </div>
  );
}
