import "./App.css";
import { Layout } from "./components/Layout/Layout";
import { useGame } from "./hooks/useGame";
import { useEngine } from "./hooks/useEngine";
import { useAnalysis } from "./hooks/useAnalysis";
import { useShortcuts } from "./hooks/useShortcuts";

function App() {
  useGame();
  useEngine();
  useAnalysis();
  useShortcuts();
  return <Layout />;
}

export default App;
