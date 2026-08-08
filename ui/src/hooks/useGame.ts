import { useGameStore } from "../stores/gameStore";

/**
 * Exposes the game store to the app root. Global keyboard shortcuts are
 * handled by useShortcuts.
 */
export function useGame() {
  return useGameStore();
}
