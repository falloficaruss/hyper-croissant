import { useState } from "react";
import { useEngineStore } from "../../stores/engineStore";

export function EngineControls() {
  const engineRunning = useEngineStore((s) => s.engineRunning);
  const engineName = useEngineStore((s) => s.engineName);
  const multipv = useEngineStore((s) => s.multipv);
  const depth = useEngineStore((s) => s.depth);
  const error = useEngineStore((s) => s.error);

  const startEngine = useEngineStore((s) => s.startEngine);
  const stopEngine = useEngineStore((s) => s.stopEngine);
  const setMultiPV = useEngineStore((s) => s.setMultiPV);
  const setDepth = useEngineStore((s) => s.setDepth);

  const [enginePath, setEnginePath] = useState(
    () =>
      (typeof localStorage !== "undefined" &&
        localStorage.getItem("oropis-engine-path")) ||
      "~/.local/bin/stockfish",
  );

  async function handleToggle() {
    if (engineRunning) {
      await stopEngine();
    } else {
      const path = enginePath.trim();
      if (!path) return;
      try {
        localStorage.setItem("oropis-engine-path", path);
      } catch {
        // ignore
      }
      await startEngine(path);
    }
  }

  return (
    <div className="engine-controls">
      <h3 className="sidebar-heading">Engine</h3>

      {!engineRunning && (
        <div className="engine-path-input">
          <label className="engine-label" htmlFor="engine-path">
            Engine path
          </label>
          <input
            id="engine-path"
            className="engine-input"
            type="text"
            placeholder="~/.local/bin/stockfish"
            value={enginePath}
            onChange={(e) => setEnginePath(e.target.value)}
          />
        </div>
      )}

      {engineRunning && (
        <div className="engine-controls-row">
          <div className="engine-name">{engineName}</div>
        </div>
      )}

      <div className="engine-controls-row">
        <label className="engine-label">
          MultiPV
          <select
            className="engine-select"
            value={multipv}
            onChange={(e) => setMultiPV(Number(e.target.value))}
            disabled={!engineRunning}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="engine-label">
          Depth
          <input
            className="engine-input engine-input-narrow"
            type="number"
            min={1}
            max={99}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            disabled={!engineRunning}
          />
        </label>
      </div>

      <button
        className="engine-toggle-btn"
        onClick={handleToggle}
      >
        {engineRunning ? "Stop Engine" : "Start Engine"}
      </button>

      {error && <div className="engine-error">{error}</div>}
    </div>
  );
}
