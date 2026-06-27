import { invoke } from "@tauri-apps/api/core";
import type { MoveData, MoveResult, PositionData, GameData } from "../types/chess";

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
