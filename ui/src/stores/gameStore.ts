import { Chess } from "chess.js";
import type { MoveData, GameData, GameHeaders, SavedGameSummary } from "../types/chess";
import * as tauri from "../lib/tauri";
import { create } from "zustand";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function algToIndex(sq: string): number {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1]) - 1;
  return rank * 8 + file;
}

function chessJsMoveToMoveData(
  chess: Chess,
  cm: {
    from: string;
    to: string;
    san: string;
    lan: string;
    piece: string;
    captured?: string;
    promotion?: string;
  },
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

function emptyHeaders(): GameHeaders {
  return {
    event: null,
    site: null,
    date: null,
    round: null,
    white: null,
    black: null,
    result: null,
    eco: null,
  };
}

function applyGameToChess(chess: Chess, initialFen: string, moves: MoveData[], upTo: number) {
  chess.reset();
  if (initialFen && initialFen !== START_FEN) {
    chess.load(initialFen);
  }
  for (let i = 0; i <= upTo && i < moves.length; i++) {
    chess.move(moves[i].san);
  }
}

function buildGameData(
  headers: GameHeaders,
  initialFen: string,
  moves: MoveData[],
  finalFen: string,
): GameData {
  return {
    headers,
    moves,
    initial_fen: initialFen || START_FEN,
    final_fen: finalFen,
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

  /** ID of the currently loaded library game, if any. */
  savedGameId: number | null;
  /** True when the session differs from the last saved snapshot. */
  isDirty: boolean;

  library: SavedGameSummary[];
  libraryQuery: string;
  libraryLoading: boolean;
  libraryError: string | null;

  loadFromPGN: (pgn: string) => Promise<void>;
  loadFromFen: (fen: string) => void;
  newGame: () => void;
  makeMove: (from: string, to: string, promotion?: string) => void;
  navigateToMove: (index: number) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  resetToStart: () => void;
  goToEnd: () => void;
  toggleFlip: () => void;
  clearError: () => void;

  refreshLibrary: (query?: string) => Promise<void>;
  setLibraryQuery: (query: string) => void;
  saveCurrentGame: () => Promise<void>;
  loadSavedGame: (id: number) => Promise<void>;
  deleteSavedGame: (id: number) => Promise<void>;
  importPgnText: (pgn: string) => Promise<number>;
  exportCurrentPgn: () => Promise<string>;
  exportSavedPgn: (id: number) => Promise<string>;
  updateHeaders: (headers: Partial<GameHeaders>) => void;
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

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
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

    savedGameId: null,
    isDirty: false,

    library: [],
    libraryQuery: "",
    libraryLoading: false,
    libraryError: null,

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
          moves.push(chessJsMoveToMoveData(chess, cm));
        }
        set({
          gameData: {
            ...gameData,
            moves,
            final_fen: chess.fen(),
          },
          moves,
          currentMoveIndex: moves.length - 1,
          isLoading: false,
          savedGameId: null,
          isDirty: true,
          ...deriveState(chess),
        });
      } catch (err) {
        set({ isLoading: false, error: errMessage(err, "Failed to load PGN") });
      }
    },

    loadFromFen: (fen: string) => {
      try {
        chess.reset();
        chess.load(fen);
        const gameData = buildGameData(emptyHeaders(), fen, [], chess.fen());
        set({
          gameData,
          moves: [],
          currentMoveIndex: -1,
          error: null,
          savedGameId: null,
          isDirty: true,
          ...deriveState(chess),
        });
      } catch {
        set({ error: "Invalid FEN" });
      }
    },

    newGame: () => {
      chess.reset();
      set({
        gameData: buildGameData(emptyHeaders(), START_FEN, [], START_FEN),
        moves: [],
        currentMoveIndex: -1,
        error: null,
        savedGameId: null,
        isDirty: false,
        ...deriveState(chess),
      });
    },

    makeMove: (from: string, to: string, promotion?: string) => {
      const { moves, currentMoveIndex, gameData } = get();
      try {
        const truncated = moves.slice(0, currentMoveIndex + 1);
        const initialFen = gameData?.initial_fen ?? START_FEN;

        applyGameToChess(chess, initialFen, truncated, truncated.length - 1);

        const cm = chess.move({ from, to, promotion });
        const moveData = chessJsMoveToMoveData(chess, cm);
        const newMoves = [...truncated, moveData];
        const headers = gameData?.headers ?? emptyHeaders();

        set({
          moves: newMoves,
          currentMoveIndex: newMoves.length - 1,
          gameData: buildGameData(headers, initialFen, newMoves, chess.fen()),
          isDirty: true,
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
      const initialFen = gameData?.initial_fen ?? START_FEN;

      applyGameToChess(chess, initialFen, moves, clamped);

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
      const initialFen = gameData?.initial_fen ?? START_FEN;
      applyGameToChess(chess, initialFen, moves, moves.length - 1);
      set({
        currentMoveIndex: moves.length - 1,
        ...deriveState(chess),
      });
    },

    toggleFlip: () => {
      set((s) => ({ boardFlipped: !s.boardFlipped }));
    },

    clearError: () => {
      set({ error: null, libraryError: null });
    },

    refreshLibrary: async (query?: string) => {
      const q = query !== undefined ? query : get().libraryQuery;
      set({ libraryLoading: true, libraryError: null, libraryQuery: q });
      try {
        const library = await tauri.listGames(q.trim() || null);
        set({ library, libraryLoading: false });
      } catch (err) {
        set({
          libraryLoading: false,
          libraryError: errMessage(err, "Failed to load game library"),
        });
      }
    },

    setLibraryQuery: (query: string) => {
      set({ libraryQuery: query });
    },

    saveCurrentGame: async () => {
      const { moves, gameData, savedGameId } = get();
      set({ isLoading: true, error: null });
      try {
        const headers = gameData?.headers ?? emptyHeaders();
        const initialFen = gameData?.initial_fen ?? START_FEN;
        const payload = buildGameData(headers, initialFen, moves, get().fen);
        const pgn = await tauri.gameDataToPgn(payload);
        const summary = await tauri.saveGame(pgn, savedGameId);
        set({
          isLoading: false,
          savedGameId: summary.id,
          isDirty: false,
          gameData: payload,
        });
        await get().refreshLibrary();
      } catch (err) {
        set({ isLoading: false, error: errMessage(err, "Failed to save game") });
      }
    },

    loadSavedGame: async (id: number) => {
      set({ isLoading: true, error: null });
      try {
        const saved = await tauri.loadGame(id);
        const gameData = await tauri.getGameFromPGN(saved.pgn);
        chess.reset();
        if (gameData.initial_fen !== chess.fen()) {
          chess.load(gameData.initial_fen);
        }
        const moves: MoveData[] = [];
        for (const m of gameData.moves) {
          const cm = chess.move(m.san);
          moves.push(chessJsMoveToMoveData(chess, cm));
        }
        // Prefer stored headers (include eco etc.) over re-parsed if needed
        const headers: GameHeaders = {
          ...gameData.headers,
          ...saved.headers,
        };
        set({
          gameData: {
            ...gameData,
            headers,
            moves,
            final_fen: chess.fen(),
          },
          moves,
          currentMoveIndex: moves.length - 1,
          isLoading: false,
          savedGameId: id,
          isDirty: false,
          ...deriveState(chess),
        });
      } catch (err) {
        set({ isLoading: false, error: errMessage(err, "Failed to load game") });
      }
    },

    deleteSavedGame: async (id: number) => {
      set({ libraryLoading: true, libraryError: null });
      try {
        await tauri.deleteGame(id);
        const { savedGameId } = get();
        if (savedGameId === id) {
          set({ savedGameId: null, isDirty: true });
        }
        await get().refreshLibrary();
      } catch (err) {
        set({
          libraryLoading: false,
          libraryError: errMessage(err, "Failed to delete game"),
        });
      }
    },

    importPgnText: async (pgn: string) => {
      set({ libraryLoading: true, libraryError: null });
      try {
        const imported = await tauri.importPgn(pgn);
        await get().refreshLibrary();
        return imported.length;
      } catch (err) {
        set({
          libraryLoading: false,
          libraryError: errMessage(err, "Failed to import PGN"),
        });
        throw err;
      }
    },

    exportCurrentPgn: async () => {
      const { moves, gameData } = get();
      const headers = gameData?.headers ?? emptyHeaders();
      const initialFen = gameData?.initial_fen ?? START_FEN;
      const payload = buildGameData(headers, initialFen, moves, get().fen);
      return tauri.gameDataToPgn(payload);
    },

    exportSavedPgn: async (id: number) => {
      return tauri.exportPgn(id);
    },

    updateHeaders: (partial: Partial<GameHeaders>) => {
      const { gameData, moves } = get();
      const headers = { ...(gameData?.headers ?? emptyHeaders()), ...partial };
      const initialFen = gameData?.initial_fen ?? START_FEN;
      set({
        gameData: buildGameData(headers, initialFen, moves, get().fen),
        isDirty: true,
      });
    },
  };
});
