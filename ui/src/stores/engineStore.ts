import type { AnalysisLine, EngineOutput, Score } from "../types/engine";
import * as tauri from "../lib/tauri";
import { create } from "zustand";
import { useGameStore } from "./gameStore";

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

interface EngineState {
  engineRunning: boolean;
  engineName: string;
  analysisLines: AnalysisLine[];
  bestMove: string | null;
  ponder: string | null;
  currentDepth: number;
  multipv: number;
  depth: number;
  error: string | null;

  setEngineRunning: (running: boolean) => void;
  setEngineName: (name: string) => void;
  handleEngineOutput: (output: EngineOutput) => void;
  startEngine: (path: string) => Promise<void>;
  stopEngine: () => Promise<void>;
  analyzePosition: (fen: string) => Promise<void>;
  stopAnalysis: () => Promise<void>;
  setMultiPV: (n: number) => Promise<void>;
  setDepth: (d: number) => void;
  clearAnalysis: () => void;
}

export const useEngineStore = create<EngineState>((set, get) => ({
  engineRunning: false,
  engineName: "",
  analysisLines: [],
  bestMove: null,
  ponder: null,
  currentDepth: 0,
  multipv: 2,
  depth: 18,
  error: null,

  setEngineRunning: (running) => set({ engineRunning: running }),

  setEngineName: (name) => set({ engineName: name }),

  handleEngineOutput: (output) => {
    if (output.type === "BestMove") {
      set({ bestMove: output.data.best_move, ponder: output.data.ponder });
      return;
    }
    if (output.type === "Info" && output.data) {
      const info = output.data;
      const { analysisLines, multipv } = get();
      const score = normalizeScore(info.score);
      if (info.pv && score && info.depth) {
        const mpv = info.multipv ?? 1;
        if (mpv > multipv) return;
        const key = mpv;
        const lines = analysisLines.filter((l) => l.multipv !== key);
        lines.push({
          multipv: mpv,
          depth: info.depth,
          score,
          pv: info.pv,
        });
        lines.sort((a, b) => a.multipv - b.multipv);
        set({
          analysisLines: lines,
          currentDepth: info.depth ?? get().currentDepth,
        });
      }
      return;
    }
  },

  startEngine: async (path: string) => {
    try {
      set({ error: null });
      await tauri.startEngine({ path, name: path.split("/").pop() ?? "engine" });
      await tauri.setEngineOption("MultiPV", String(get().multipv));
      const engName = path.split("/").pop() ?? "Engine";
      set({ engineRunning: true, engineName: engName });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start engine";
      set({ error: message, engineRunning: false });
    }
  },

  stopEngine: async () => {
    try {
      await tauri.stopEngine();
      set({ engineRunning: false, analysisLines: [], bestMove: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stop engine";
      set({ error: message });
    }
  },

  analyzePosition: async (fen: string) => {
    const { engineRunning, depth } = get();
    if (!engineRunning) return;
    try {
      set({
        analysisLines: [],
        bestMove: null,
        ponder: null,
        currentDepth: 0,
        error: null,
      });
      // Interrupt any in-flight search so the next go starts promptly.
      try {
        await tauri.stopAnalysis();
      } catch {
        // ignore if engine already idle
      }
      await tauri.goPosition(fen, [], depth);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to analyze";
      set({ error: message });
    }
  },

  stopAnalysis: async () => {
    try {
      await tauri.stopAnalysis();
    } catch {
      // ignore
    }
  },

  setMultiPV: async (n: number) => {
    set({ multipv: n });
    try {
      await tauri.setEngineOption("MultiPV", String(n));
      const { engineRunning, analyzePosition } = get();
      if (engineRunning) {
        await analyzePosition(useGameStore.getState().fen);
      }
    } catch {
      // ignore
    }
  },

  setDepth: (d: number) => set({ depth: d }),

  clearAnalysis: () => set({ analysisLines: [], bestMove: null, currentDepth: 0 }),
}));
