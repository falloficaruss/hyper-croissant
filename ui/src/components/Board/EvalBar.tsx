import { useEngineStore } from "../../stores/engineStore";
import { scoreToWinPercent, formatScore, type Score } from "../../types/engine";

interface Props {
  /** Hide eval numbers / bar fill (coach mode spoiler). */
  hideNumbers?: boolean;
}

/** Accept wire scores even if a bare number slips through. */
function normalizeScore(raw: unknown): Score | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { type: "Cp", value: raw };
  }
  if (typeof raw === "object") {
    const obj = raw as { type?: unknown; value?: unknown; kind?: unknown };
    const value = typeof obj.value === "number" ? obj.value : null;
    if (value === null) return null;
    if (obj.type === "Mate" || obj.kind === "mate") return { type: "Mate", value };
    if (obj.type === "Cp" || obj.kind === "cp") return { type: "Cp", value };
  }
  return null;
}

export function EvalBar({ hideNumbers = false }: Props) {
  const analysisLines = useEngineStore((s) => s.analysisLines);

  const topLine = analysisLines.find((l) => l.multipv === 1) ?? analysisLines[0] ?? null;
  const score = normalizeScore(topLine?.score);
  const pct = scoreToWinPercent(score);

  // Neutral bar when hiding spoilers. White is the bottom segment (standard chess UI).
  const whitePct = hideNumbers ? 50 : pct !== null ? pct : 50;
  const blackPct = 100 - whitePct;

  const evalText = formatScore(score);
  // Put the number in the larger segment so it stays readable.
  const textInWhite = whitePct >= blackPct;

  return (
    <div className={`eval-bar${hideNumbers ? " coach-hidden" : ""}`}>
      <div className="eval-bar-inner">
        <div className="eval-bar-black" style={{ height: `${blackPct}%` }}>
          {!hideNumbers && !textInWhite && blackPct > 12 && (
            <span className="eval-bar-text eval-bar-text-black">{evalText}</span>
          )}
        </div>
        <div className="eval-bar-white" style={{ height: `${whitePct}%` }}>
          {!hideNumbers && textInWhite && whitePct > 12 && (
            <span className="eval-bar-text eval-bar-text-white">{evalText}</span>
          )}
        </div>
      </div>
      <div className="eval-bar-label-b">B</div>
      <div className="eval-bar-label-w">W</div>
    </div>
  );
}
