import { useEffect } from "react";
import { useGameStore } from "../stores/gameStore";

export function useGame() {
  const store = useGameStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          store.navigateBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          store.navigateForward();
          break;
        case "ArrowUp":
          e.preventDefault();
          store.resetToStart();
          break;
        case "ArrowDown":
          e.preventDefault();
          store.goToEnd();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store]);

  return store;
}
