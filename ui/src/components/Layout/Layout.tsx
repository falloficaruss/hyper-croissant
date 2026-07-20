import { ChessBoard } from "../ChessBoard/ChessBoard";
import { MoveList } from "../MoveList/MoveList";
import { PositionInfo } from "../PositionInfo/PositionInfo";
import { PGNInput } from "../PGNInput/PGNInput";
import { EvalBar } from "../Board/EvalBar";
import { AnalysisPanel } from "../Analysis/AnalysisPanel";
import { EngineControls } from "../Analysis/EngineControls";
import { EvalSwingCard } from "../Analysis/EvalSwingCard";
import { ComparisonCard } from "../Analysis/ComparisonCard";
import { ExplanationPanel } from "../LLM/ExplanationPanel";
import { useGameStore } from "../../stores/gameStore";
import { useAnalysisStore } from "../../stores/analysisStore";
import "./Layout.css";

export function Layout() {
  const toggleFlip = useGameStore((s) => s.toggleFlip);
  const hasSwing = useAnalysisStore(
    (s) => s.currentSwing !== null || s.swingLoading || s.swingError !== null,
  );
  const hasComparison = useAnalysisStore(
    (s) =>
      s.currentComparison !== null ||
      s.comparisonLoading ||
      s.comparisonError !== null,
  );

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1 className="app-title">Hyper-Croissant</h1>
        <button className="flip-btn" onClick={toggleFlip} title="Flip board">
          Flip Board
        </button>
      </header>
      <main className="app-main">
        <section className="board-area">
          <EvalBar />
          <div className="board-panel">
            <ChessBoard />
          </div>
        </section>
        <aside className="sidebar">
          <div className="sidebar-section">
            <PGNInput />
          </div>
          <div className="sidebar-section">
            <PositionInfo />
          </div>
          <div className="sidebar-section">
            <EngineControls />
          </div>
          {hasSwing && (
            <div className="sidebar-section">
              <EvalSwingCard />
            </div>
          )}
          {hasComparison && (
            <div className="sidebar-section">
              <ComparisonCard />
            </div>
          )}
          <div className="sidebar-section analysis-section">
            <AnalysisPanel />
          </div>
          <div className="sidebar-section analysis-section">
            <ExplanationPanel />
          </div>
          <div className="sidebar-section move-list-section">
            <h2 className="sidebar-heading">Moves</h2>
            <MoveList />
          </div>
        </aside>
      </main>
    </div>
  );
}
