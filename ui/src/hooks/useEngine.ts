import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEngineStore } from "../stores/engineStore";
import { useGameStore } from "../stores/gameStore";
import type { EngineOutput } from "../types/engine";

export function useEngine() {
  const handleEngineOutput = useEngineStore((s) => s.handleEngineOutput);
  const engineRunning = useEngineStore((s) => s.engineRunning);
  const depth = useEngineStore((s) => s.depth);
  const analyzePosition = useEngineStore((s) => s.analyzePosition);
  const fen = useGameStore((s) => s.fen);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    (async () => {
      const fn = await listen<EngineOutput>("engine-output", (event) => {
        handleEngineOutput(event.payload);
      });
      if (cancelled) fn();
      else unlisten = fn;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleEngineOutput]);

  // Debounce engine searches so rapid moves/nav don't thrash UCI/IPC.
  useEffect(() => {
    if (!engineRunning) return;
    const t = window.setTimeout(() => {
      void analyzePosition(fen);
    }, 40);
    return () => window.clearTimeout(t);
  }, [engineRunning, fen, depth, analyzePosition]);
}
