import { useEngineStore } from "../../stores/engineStore";
import { scoreToWinPercent, formatScore } from "../../types/engine";

export function EvalBar() {
  const analysisLines = useEngineStore((s) => s.analysisLines);

  const topLine = analysisLines.find((l) => l.multipv === 1) ?? null;
  const pct = scoreToWinPercent(topLine?.score ?? null);

  const whitePct = pct !== null ? pct : 50;
  const blackPct = 100 - whitePct;

  const evalText = topLine ? formatScore(topLine.score) : "-";

  return (
    <div className="eval-bar">
      <div className="eval-bar-inner">
        <div
          className="eval-bar-white"
          style={{ height: `${whitePct}%` }}
        >
          {whitePct > 15 && (
            <span className="eval-bar-text eval-bar-text-white">{evalText}</span>
          )}
        </div>
        <div
          className="eval-bar-black"
          style={{ height: `${blackPct}%` }}
        >
          {blackPct > 15 && (
            <span className="eval-bar-text eval-bar-text-black">{evalText}</span>
          )}
        </div>
      </div>
      <div className="eval-bar-divider" />
      <div className="eval-bar-label-w">W</div>
      <div className="eval-bar-label-b">B</div>
    </div>
  );
}
