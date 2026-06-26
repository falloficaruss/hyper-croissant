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
