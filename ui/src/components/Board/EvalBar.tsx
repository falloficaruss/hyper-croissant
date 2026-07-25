import { useEngineStore } from "../../stores/engineStore";
import { scoreToWinPercent, formatScore } from "../../types/engine";

interface Props {
  /** Hide eval numbers / bar fill (coach mode spoiler). */
  hideNumbers?: boolean;
}

export function EvalBar({ hideNumbers = false }: Props) {
  const analysisLines = useEngineStore((s) => s.analysisLines);

  const topLine = analysisLines.find((l) => l.multipv === 1) ?? null;
  const pct = scoreToWinPercent(topLine?.score ?? null);

  // Neutral bar when hiding spoilers
  const whitePct = hideNumbers ? 50 : pct !== null ? pct : 50;
  const blackPct = 100 - whitePct;

  const evalText = topLine ? formatScore(topLine.score) : "-";

  return (
    <div className={`eval-bar${hideNumbers ? " coach-hidden" : ""}`}>
      <div className="eval-bar-inner">
        <div
          className="eval-bar-white"
          style={{ height: `${whitePct}%` }}
        >
          {!hideNumbers && whitePct > 15 && (
            <span className="eval-bar-text eval-bar-text-white">{evalText}</span>
          )}
        </div>
        <div
          className="eval-bar-black"
          style={{ height: `${blackPct}%` }}
        >
          {!hideNumbers && blackPct > 15 && (
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
