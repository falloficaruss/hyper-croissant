import { ChessBoard } from "../ChessBoard/ChessBoard";
import { MoveList } from "../MoveList/MoveList";
import { PositionInfo } from "../PositionInfo/PositionInfo";
import { PGNInput } from "../PGNInput/PGNInput";
import { useGameStore } from "../../stores/gameStore";
import "./Layout.css";

export function Layout() {
  const toggleFlip = useGameStore((s) => s.toggleFlip);

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1 className="app-title">Hyper-Croissant</h1>
        <button className="flip-btn" onClick={toggleFlip} title="Flip board">
          Flip Board
        </button>
      </header>
      <main className="app-main">
        <section className="board-panel">
          <ChessBoard />
        </section>
        <aside className="sidebar">
          <div className="sidebar-section">
            <PGNInput />
          </div>
          <div className="sidebar-section">
            <PositionInfo />
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
