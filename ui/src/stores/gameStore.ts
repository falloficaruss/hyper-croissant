import { Chess } from "chess.js";
import type { MoveData, GameData } from "../types/chess";
import * as tauri from "../lib/tauri";
import { create } from "zustand";

function algToIndex(sq: string): number {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1]) - 1;
  return rank * 8 + file;
}

function chessJsMoveToMoveData(
  chess: Chess,
  cm: { from: string; to: string; san: string; lan: string; piece: string; captured?: string; promotion?: string },
): MoveData {
  return {
    uci: cm.lan,
    san: cm.san,
    from_index: algToIndex(cm.from),
    to_index: algToIndex(cm.to),
    piece: cm.promotion ? "p" : cm.piece.toUpperCase(),
    is_capture: !!cm.captured,
    is_check: chess.isCheck(),
    is_checkmate: chess.isCheckmate(),
  };
}

interface GameState {
  gameData: GameData | null;
  moves: MoveData[];
  currentMoveIndex: number;
  fen: string;
  turn: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  boardFlipped: boolean;
  isLoading: boolean;
  error: string | null;
  lastMove: { from: string; to: string } | null;

  loadFromPGN: (pgn: string) => Promise<void>;
  makeMove: (from: string, to: string, promotion?: string) => void;
  navigateToMove: (index: number) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  resetToStart: () => void;
  goToEnd: () => void;
  toggleFlip: () => void;
  clearError: () => void;
}

function deriveState(chess: Chess) {
  const history = chess.history({ verbose: true });
  const last = history[history.length - 1];
  return {
    fen: chess.fen(),
    turn: chess.turn(),
    isCheck: chess.isCheck(),
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    lastMove: last ? { from: last.from, to: last.to } : null,
  };
}

export const useGameStore = create<GameState>((set, get) => {
  const chess = new Chess();

  return {
    gameData: null,
    moves: [],
    currentMoveIndex: -1,
    fen: chess.fen(),
    turn: chess.turn(),
    isCheck: chess.isCheck(),
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    boardFlipped: false,
    isLoading: false,
    error: null,
    lastMove: null,

    loadFromPGN: async (pgn: string) => {
      set({ isLoading: true, error: null });
      try {
        const gameData = await tauri.getGameFromPGN(pgn);
        chess.reset();
        if (gameData.initial_fen !== chess.fen()) {
          chess.load(gameData.initial_fen);
        }
        const moves: MoveData[] = [];
        for (const m of gameData.moves) {
          const cm = chess.move(m.san);
          moves.push(
            chessJsMoveToMoveData(chess, cm),
          );
        }
        set({
          gameData,
          moves,
          currentMoveIndex: moves.length - 1,
          isLoading: false,
          ...deriveState(chess),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load PGN";
        set({ isLoading: false, error: message });
      }
    },

    makeMove: (from: string, to: string, promotion?: string) => {
      const { moves, currentMoveIndex } = get();
      try {
        const truncated = moves.slice(0, currentMoveIndex + 1);

        chess.reset();
        if (get().gameData?.initial_fen) {
          chess.load(get().gameData!.initial_fen);
        }
        for (const m of truncated) {
          chess.move(m.san);
        }

        const cm = chess.move({ from, to, promotion });
        const moveData = chessJsMoveToMoveData(chess, cm);
        const newMoves = [...truncated, moveData];

        set({
          moves: newMoves,
          currentMoveIndex: newMoves.length - 1,
          gameData: null,
          ...deriveState(chess),
        });
      } catch {
        set({ error: "Illegal move" });
      }
    },

    navigateToMove: (index: number) => {
      const { gameData, moves } = get();
      const totalMoves = moves.length;
      const clamped = Math.max(-1, Math.min(index, totalMoves - 1));

      chess.reset();
      if (gameData?.initial_fen) {
        chess.load(gameData.initial_fen);
      }
      for (let i = 0; i <= clamped; i++) {
        chess.move(moves[i].san);
      }

      set({
        currentMoveIndex: clamped,
        ...deriveState(chess),
      });
    },

    navigateBack: () => {
      const { currentMoveIndex } = get();
      if (currentMoveIndex >= 0) {
        chess.undo();
        set({
          currentMoveIndex: currentMoveIndex - 1,
          ...deriveState(chess),
        });
      }
    },

    navigateForward: () => {
      const { currentMoveIndex, moves } = get();
      if (currentMoveIndex < moves.length - 1) {
        const cm = chess.move(moves[currentMoveIndex + 1].san);
        const md = chessJsMoveToMoveData(chess, cm);
        const newMoves = [...moves];
        newMoves[currentMoveIndex + 1] = md;
        set({
          moves: newMoves,
          currentMoveIndex: currentMoveIndex + 1,
          ...deriveState(chess),
        });
      }
    },

    resetToStart: () => {
      const { gameData } = get();
      chess.reset();
      if (gameData?.initial_fen) {
        chess.load(gameData.initial_fen);
      }
      set({
        currentMoveIndex: -1,
        ...deriveState(chess),
      });
    },

    goToEnd: () => {
      const { moves, gameData } = get();
      chess.reset();
      if (gameData?.initial_fen) {
        chess.load(gameData.initial_fen);
      }
      for (const m of moves) {
        chess.move(m.san);
      }
      set({
        currentMoveIndex: moves.length - 1,
        ...deriveState(chess),
      });
    },

    toggleFlip: () => {
      set((s) => ({ boardFlipped: !s.boardFlipped }));
    },

    clearError: () => {
      set({ error: null });
    },
  };
});
