import { useEffect } from "react";
import { useCoachStore } from "../stores/coachStore";
import { useGameStore } from "../stores/gameStore";
import { useSettingsStore } from "../stores/settingsStore";
import { emitShortcut } from "../lib/shortcutBus";

/** True when the event target is a text-editing context (input, textarea, …). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  ) {
    return true;
  }
  if (target.isContentEditable) return true;
  return target.getAttribute("role") === "textbox";
}

/**
 * Global keyboard shortcuts. "mod" means Ctrl on Windows/Linux, Cmd on macOS.
 *
 * Navigation: ←/→ step back/forward, ↑/Home to start, ↓/End to end.
 * Board:      mod+Z back, mod+Shift+Z / mod+Y forward, mod+F flip.
 * Game:       mod+N new game, mod+O open PGN, mod+S save, mod+Shift+E export.
 * UI:         mod+K coach mode, mod+, LLM settings, Escape closes settings.
 *
 * Actions that live inside components (new game confirm, file picker, export
 * status) are routed through the shortcut bus instead of being duplicated.
 */
export function useShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (useSettingsStore.getState().settingsOpen) {
          useSettingsStore.getState().setSettingsOpen(false);
        }
        return;
      }

      // While the settings modal is open, ignore all other shortcuts.
      if (useSettingsStore.getState().settingsOpen) return;
      if (isTypingTarget(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod) {
        if (e.altKey) return;
        const key = e.key.toLowerCase();
        const shifted = e.shiftKey;
        const game = useGameStore.getState();

        if (key === "z") {
          e.preventDefault();
          if (shifted) game.navigateForward();
          else game.navigateBack();
          return;
        }
        if (key === "y" && !shifted) {
          e.preventDefault();
          game.navigateForward();
          return;
        }
        if (key === "n" && !shifted) {
          e.preventDefault();
          emitShortcut("new-game");
          return;
        }
        if (key === "o" && !shifted) {
          e.preventDefault();
          emitShortcut("open-file");
          return;
        }
        if (key === "s" && !shifted) {
          e.preventDefault();
          void game.saveCurrentGame();
          return;
        }
        if (key === "e" && shifted) {
          e.preventDefault();
          emitShortcut("export-pgn");
          return;
        }
        if (key === "f" && !shifted) {
          e.preventDefault();
          game.toggleFlip();
          return;
        }
        if (key === "k" && !shifted) {
          e.preventDefault();
          const coach = useCoachStore.getState();
          coach.setEnabled(!coach.enabled);
          return;
        }
        if (key === ",") {
          e.preventDefault();
          useSettingsStore.getState().setSettingsOpen(true);
          return;
        }
        return;
      }

      if (e.altKey) return;

      const game = useGameStore.getState();
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          game.navigateBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          game.navigateForward();
          break;
        case "ArrowUp":
        case "Home":
          e.preventDefault();
          game.resetToStart();
          break;
        case "ArrowDown":
        case "End":
          e.preventDefault();
          game.goToEnd();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
