import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEngineStore } from "../stores/engineStore";
import type { EngineOutput } from "../types/engine";

export function useEngine() {
  const store = useEngineStore();
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    async function setup() {
      const unlisten = await listen<EngineOutput>("engine-output", (event) => {
        store.handleEngineOutput(event.payload);
      });
      unlistenRef.current = unlisten;
    }
    setup();
    return () => {
      unlistenRef.current?.();
    };
  }, [store]);

  return store;
}
