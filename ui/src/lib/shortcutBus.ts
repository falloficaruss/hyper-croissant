/**
 * Tiny typed event bus for global keyboard shortcuts that need to trigger
 * component-owned actions (e.g. the PGN file picker in GameControls).
 */
export type ShortcutName = "open-file" | "new-game" | "export-pgn";

const listeners = new Map<ShortcutName, Set<() => void>>();

/** Subscribe to a shortcut action. Returns an unsubscribe function. */
export function onShortcut(name: ShortcutName, fn: () => void): () => void {
  let set = listeners.get(name);
  if (!set) {
    set = new Set();
    listeners.set(name, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

/** Fire a shortcut action to all subscribers. */
export function emitShortcut(name: ShortcutName): void {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of [...set]) {
    fn();
  }
}
