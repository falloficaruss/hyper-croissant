export type Score =
  | { type: "Cp"; value: number }
  | { type: "Mate"; value: number };

export interface InfoData {
  depth: number | null;
  seldepth: number | null;
  multipv: number | null;
  score: Score | null;
  nodes: number | null;
  nps: number | null;
  hashfull: number | null;
  tbhits: number | null;
  time: number | null;
  pv: string[] | null;
}

export interface BestMoveData {
  best_move: string;
  ponder: string | null;
}

export interface IdData {
  name: string;
  author: string;
}

export type EngineOutput =
  | { type: "Id"; data: IdData }
  | { type: "UciOk"; data: null }
  | { type: "ReadyOk"; data: null }
  | { type: "BestMove"; data: BestMoveData }
  | { type: "Info"; data: InfoData };

export interface AnalysisLine {
  multipv: number;
  depth: number;
  score: Score;
  pv: string[];
}

export function cpToWinPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1);
}

export function scoreToWinPercent(score: Score | null): number | null {
  if (!score) return null;
  if (score.type === "Cp") return cpToWinPercent(score.value);
  return score.value > 0 ? 100 : 0;
}

export function formatScore(score: Score | null): string {
  if (!score) return "-";
  if (score.type === "Cp") {
    const val = score.value / 100;
    return val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
  }
  return score.value > 0 ? `+#${score.value}` : `-#${Math.abs(score.value)}`;
}

