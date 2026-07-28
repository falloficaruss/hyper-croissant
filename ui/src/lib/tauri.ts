import { invoke } from "@tauri-apps/api/core";
import type {
  MoveData,
  MoveResult,
  PositionData,
  GameData,
  SavedGame,
  SavedGameSummary,
} from "../types/chess";
import type {
  StructuredAnalysis,
  MoveComparison,
  CachedAnalysis,
  EngineLineInfo,
  ScoreData,
  EvalSwing,
} from "../types/analysis";

export const getLegalMoves = (fen: string) =>
  invoke<MoveData[]>("get_legal_moves", { fen });

export const validatePosition = (fen: string) =>
  invoke<PositionData>("validate_position", { fen });

export const makeMove = (fen: string, uci_move: string) =>
  invoke<MoveResult>("make_move_command", { fen, uciMove: uci_move });

export const makeMoves = (fen: string, uci_moves: string[]) =>
  invoke<MoveResult>("make_moves_command", { fen, uciMoves: uci_moves });

export const getGameFromPGN = (pgn: string) =>
  invoke<GameData>("get_game_from_pgn", { pgn });

// Game library (Phase 8)
export const saveGame = (pgn: string, id?: number | null) =>
  invoke<SavedGameSummary>("save_game", { pgn, id: id ?? null });

export const loadGame = (id: number) =>
  invoke<SavedGame>("load_game", { id });

export const listGames = (query?: string | null) =>
  invoke<SavedGameSummary[]>("list_games", { query: query ?? null });

export const deleteGame = (id: number) =>
  invoke<void>("delete_game", { id });

export const importPgn = (pgn: string) =>
  invoke<SavedGameSummary[]>("import_pgn", { pgn });

export const exportPgn = (id: number) =>
  invoke<string>("export_pgn", { id });

export const gameDataToPgn = (game: GameData) =>
  invoke<string>("game_data_to_pgn", { game });

// Engine commands
export const startEngine = (config: { path: string; name: string }) =>
  invoke<void>("start_engine", { config });

export const stopEngine = () =>
  invoke<void>("stop_engine");

export const goPosition = (fen: string, moves: string[], depth: number) =>
  invoke<void>("go_position", { fen, moves, depth });

export const stopAnalysis = () =>
  invoke<void>("stop_analysis");

export const setEngineOption = (name: string, value: string) =>
  invoke<void>("set_engine_option", { name, value });

// Analysis commands (Phase 2.5)
export const analyzePosition = (fen: string, engineLines: EngineLineInfo[]) =>
  invoke<StructuredAnalysis>("analyze_position_command", { fen, engineLines });

export const compareMoves = (
  fen: string,
  userMove: string,
  engineMove: string,
  userScore?: ScoreData,
  engineScore?: ScoreData,
) =>
  invoke<MoveComparison>("compare_moves_command", {
    fen,
    userMove,
    engineMove,
    userScore,
    engineScore,
  });

export const getCachedAnalysis = (fen: string) =>
  invoke<CachedAnalysis | null>("get_cached_analysis", { fen });

export const analyzeEvalSwing = (
  fenBefore: string,
  userMove: string,
  evalBefore?: ScoreData,
  evalAfter?: ScoreData,
) =>
  invoke<EvalSwing>("analyze_eval_swing_command", {
    fenBefore,
    userMove,
    evalBefore,
    evalAfter,
  });
