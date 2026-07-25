import { ChessBoard } from "../ChessBoard/ChessBoard";
import { MoveList } from "../MoveList/MoveList";
import { PositionInfo } from "../PositionInfo/PositionInfo";
import { PGNInput } from "../PGNInput/PGNInput";
import { EvalBar } from "../Board/EvalBar";
import { AnalysisPanel } from "../Analysis/AnalysisPanel";
import { EngineControls } from "../Analysis/EngineControls";
import { EvalSwingCard } from "../Analysis/EvalSwingCard";
import { ComparisonCard } from "../Analysis/ComparisonCard";
import { PlanCard } from "../Analysis/PlanCard";
import { ExplanationPanel } from "../LLM/ExplanationPanel";
import { CoachMode } from "../Coach/CoachMode";
import { useGameStore } from "../../stores/gameStore";
import { useAnalysisStore } from "../../stores/analysisStore";
import { useCoachStore } from "../../stores/coachStore";
import "./Layout.css";

export function Layout() {
  const toggleFlip = useGameStore((s) => s.toggleFlip);
  const coachEnabled = useCoachStore((s) => s.enabled);
  const coachPhase = useCoachStore((s) => s.phase);
  const setCoachEnabled = useCoachStore((s) => s.setEnabled);

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

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1 className="app-title">Hyper-Croissant</h1>
        <div className="header-actions">
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
      <main className="app-main">
        <section className="board-area">
          <EvalBar hideNumbers={hideAnalysis} />
          <div className="board-panel">
            <ChessBoard hideBestMove={hideAnalysis} />
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
    </div>
  );
}
