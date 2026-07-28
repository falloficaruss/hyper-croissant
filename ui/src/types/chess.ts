export interface MoveData {
  uci: string;
  san: string;
  from_index: number;
  to_index: number;
  piece: string;
  is_capture: boolean;
  is_check: boolean;
  is_checkmate: boolean;
}

export interface PositionData {
  fen: string;
  turn: string;
  is_check: boolean;
  is_checkmate: boolean;
  is_stalemate: boolean;
  legal_moves: MoveData[];
}

export interface MoveResult {
  position: PositionData;
  move_played: MoveData;
}

export interface GameHeaders {
  event?: string | null;
  site?: string | null;
  date?: string | null;
  round?: string | null;
  white?: string | null;
  black?: string | null;
  result?: string | null;
  eco?: string | null;
}

export interface GameData {
  headers: GameHeaders;
  moves: MoveData[];
  initial_fen: string;
  final_fen: string;
}

/** Lightweight library row from the backend game store. */
export interface SavedGameSummary {
  id: number;
  white?: string | null;
  black?: string | null;
  event?: string | null;
  site?: string | null;
  date?: string | null;
  round?: string | null;
  result?: string | null;
  eco?: string | null;
  move_count: number;
  created_at: number;
  updated_at: number;
}

/** Full saved game including PGN text. */
export interface SavedGame {
  id: number;
  headers: GameHeaders;
  pgn: string;
  initial_fen: string;
  move_count: number;
  created_at: number;
  updated_at: number;
}
