import { useEffect, useRef, useState } from "react";
import { ChessBoard } from "../ChessBoard/ChessBoard";
import { MoveList } from "../MoveList/MoveList";
import { PositionInfo } from "../PositionInfo/PositionInfo";
import { PGNInput } from "../PGNInput/PGNInput";
import { GameList } from "../Game/GameList";
import { GameMetadata } from "../Game/GameMetadata";
import { GameControls } from "../Game/GameControls";
import { EvalBar } from "../Board/EvalBar";
import { AnalysisPanel } from "../Analysis/AnalysisPanel";
import { EngineControls } from "../Analysis/EngineControls";
import { EvalSwingCard } from "../Analysis/EvalSwingCard";
import { ComparisonCard } from "../Analysis/ComparisonCard";
import { PlanCard } from "../Analysis/PlanCard";
import { SearchTreeView } from "../Analysis/SearchTreeView";

import { ExplanationPanel } from "../LLM/ExplanationPanel";
import { LLMSettings } from "../LLM/LLMSettings";
import { CoachMode } from "../Coach/CoachMode";
import { useGameStore } from "../../stores/gameStore";
import { useAnalysisStore } from "../../stores/analysisStore";
import { useCoachStore } from "../../stores/coachStore";
import { useSettingsStore } from "../../stores/settingsStore";
import "./Layout.css";

const SIDEBAR_WIDTH_KEY = "oropis-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 360;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 640;
const MIN_BOARD_AREA_WIDTH = 280;

function clampSidebarWidth(n: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(n)));
}

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw == null) return DEFAULT_SIDEBAR_WIDTH;
    const n = Number(raw);
    if (Number.isFinite(n)) return clampSidebarWidth(n);
  } catch {
    // ignore
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

function saveSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    // ignore
  }
}

function maxSidebarForMain(mainWidth: number): number {
  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(MIN_SIDEBAR_WIDTH, Math.floor(mainWidth - MIN_BOARD_AREA_WIDTH)),
  );
}

export function Layout() {
  const toggleFlip = useGameStore((s) => s.toggleFlip);
  const coachEnabled = useCoachStore((s) => s.enabled);
  const coachPhase = useCoachStore((s) => s.phase);
  const setCoachEnabled = useCoachStore((s) => s.setEnabled);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const mainRef = useRef<HTMLElement>(null);
  const draggingRef = useRef(false);
  const sidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    function clampToViewport() {
      const main = mainRef.current;
      if (!main) return;
      const maxForViewport = maxSidebarForMain(main.getBoundingClientRect().width);
      setSidebarWidth((w) => Math.min(w, maxForViewport));
    }
    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, []);

  // Hide spoilers while coaching (until answer is revealed)
  const hideAnalysis = coachEnabled && coachPhase !== "revealed";

  const hasSwing = useAnalysisStore(
    (s) => s.currentSwing !== null || s.swingLoading || s.swingError !== null,
  );
  const hasComparison = useAnalysisStore(
    (s) =>
      s.currentComparison !== null ||
      s.comparisonLoading ||
      s.comparisonError !== null,
  );
  const hasPlan = useAnalysisStore(
    (s) => s.currentPlan !== null || s.planLoading || s.planError !== null,
  );
  const hasSearchTree = useAnalysisStore(
    (s) =>
      s.currentSearchTree !== null ||
      s.searchTreeLoading ||
      s.searchTreeError !== null,
  );

  function onResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 800px)").matches
    ) {
      return;
    }
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    document.body.classList.add("sidebar-resizing");
  }

  function onResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const main = mainRef.current;
    if (!main) return;
    const mainRect = main.getBoundingClientRect();
    const raw = mainRect.right - e.clientX;
    const maxForViewport = maxSidebarForMain(mainRect.width);
    const next = Math.min(
      maxForViewport,
      Math.max(MIN_SIDEBAR_WIDTH, Math.round(raw)),
    );
    sidebarWidthRef.current = next;
    setSidebarWidth(next);
  }

  function onResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const el = e.target as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    document.body.classList.remove("sidebar-resizing");
    saveSidebarWidth(sidebarWidthRef.current);
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1 className="app-title">Oropis</h1>
        <div className="header-actions">
          <button
            className="settings-header-btn"
            onClick={() => setSettingsOpen(true)}
            title="LLM Settings — provider, API key, model"
            type="button"
          >
            Settings
          </button>
          <button
            className={`coach-header-btn${coachEnabled ? " active" : ""}`}
            onClick={() => setCoachEnabled(!coachEnabled)}
            title={
              coachEnabled
                ? "Exit coach mode"
                : "Enter coach mode — hide analysis and practice with questions"
            }
            type="button"
          >
            {coachEnabled ? "Coach On" : "Coach Mode"}
          </button>
          <button className="flip-btn" onClick={toggleFlip} title="Flip board" type="button">
            Flip Board
          </button>
        </div>
      </header>
      <main className="app-main" ref={mainRef}>
        <section className="board-area">
          <EvalBar hideNumbers={hideAnalysis} />
          <div className="board-panel">
            <ChessBoard hideBestMove={hideAnalysis} />
          </div>
        </section>
        <aside
          className="sidebar"
          style={
            {
              ["--sidebar-width" as string]: `${sidebarWidth}px`,
            } as React.CSSProperties
          }
        >
          <div
            className="sidebar-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuemax={MAX_SIDEBAR_WIDTH}
            aria-valuenow={sidebarWidth}
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
          />
          <div className="sidebar-section">
            <GameList />
          </div>
          <div className="sidebar-section">
            <GameControls />
            <div className="game-controls-spacer">
              <GameMetadata />
            </div>
            <PGNInput />
          </div>
          <div className="sidebar-section">
            <PositionInfo />
          </div>
          <div className="sidebar-section">
            <EngineControls />
          </div>

          <div className={`sidebar-section${coachEnabled ? " analysis-section" : ""}`}>
            <CoachMode />
          </div>

          {!hideAnalysis && hasSwing && (
            <div className="sidebar-section">
              <EvalSwingCard />
            </div>
          )}
          {!hideAnalysis && hasComparison && (
            <div className="sidebar-section">
              <ComparisonCard />
            </div>
          )}
          {!hideAnalysis && hasPlan && (
            <div className="sidebar-section">
              <PlanCard />
            </div>
          )}
          {!hideAnalysis && hasSearchTree && (
            <div className="sidebar-section">
              <SearchTreeView />
            </div>
          )}
          {!hideAnalysis && (
            <div className="sidebar-section analysis-section">
              <AnalysisPanel />
            </div>
          )}
          {!coachEnabled && (
            <div className="sidebar-section analysis-section">
              <ExplanationPanel />
            </div>
          )}
          <div className="sidebar-section move-list-section">
            <h2 className="sidebar-heading">Moves</h2>
            <MoveList />
          </div>
        </aside>
      </main>
      <LLMSettings />
    </div>
  );
}
