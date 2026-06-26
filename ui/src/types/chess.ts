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
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white?: string;
  black?: string;
  result?: string;
}

export interface GameData {
  headers: GameHeaders;
  moves: MoveData[];
  initial_fen: string;
  final_fen: string;
}
