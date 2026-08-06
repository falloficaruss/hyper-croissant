import { Chess } from "chess.js";

/** Convert a single UCI move to SAN from `fen`. Falls back to UCI on failure. */
export function uciToSan(fen: string, uci: string): string {
  if (!uci || uci.length < 4) return uci;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

/** Convert a UCI principal variation to SAN from `fen`. Stops on the first illegal move. */
export function pvToSan(fen: string, pv: string[]): string[] {
  if (pv.length === 0) return [];
  try {
    const chess = new Chess(fen);
    const sans: string[] = [];
    for (const uci of pv) {
      if (!uci || uci.length < 4) {
        sans.push(uci);
        break;
      }
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      if (!move) {
        sans.push(uci);
        break;
      }
      sans.push(move.san);
    }
    return sans;
  } catch {
    return [...pv];
  }
}
