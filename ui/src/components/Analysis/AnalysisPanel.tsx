import { useEngineStore } from "../../stores/engineStore";
import { PVLine } from "./PVLine";
import { useGameStore } from "../../stores/gameStore";

export function AnalysisPanel() {
  const analysisLines = useEngineStore((s) => s.analysisLines);
  const engineRunning = useEngineStore((s) => s.engineRunning);
  const currentDepth = useEngineStore((s) => s.currentDepth);
  const makeMove = useGameStore((s) => s.makeMove);

  function handlePlayMove(uci: string) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    makeMove(from, to, promotion);
  }

  if (!engineRunning) {
    return (
      <div className="analysis-panel">
        <div className="analysis-empty">Start engine to see analysis</div>
      </div>
    );
  }

  if (analysisLines.length === 0) {
    return (
      <div className="analysis-panel">
        <div className="analysis-empty">Waiting for analysis...</div>
      </div>
    );
  }

  return (
    <div className="analysis-panel">
      <div className="analysis-header">
        <span className="analysis-title">Analysis</span>
        <span className="analysis-depth">Depth {currentDepth}</span>
      </div>
      <div className="analysis-lines">
        {analysisLines.map((line) => (
          <PVLine
            key={line.multipv}
            line={line}
            isBest={line.multipv === 1}
            onPlayMove={handlePlayMove}
          />
        ))}
      </div>
    </div>
  );
}
